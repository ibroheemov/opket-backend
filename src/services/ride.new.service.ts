import { RideCompletedPayload } from "../bot/socket/types";
import { sleep } from "../bot/utils/helpers";
import { emitToDriver, emitToUser } from "../gateway/ride.socket";
import { DriverModel } from "../models/DriverModel";
import { RideModel } from "../models/Ride";
import { redis } from "../redis/redisClient";
import { DriverRepository } from "../repositories/driver.repository";
import { RideRepository } from "../repositories/ride.repository";
import { DriverSession, driverStoreRedis } from "../store/driverStoreRedis";
import { calculateApproxTime } from "../utils/calculateApproxTime";
import { handleRideCommission } from "../utils/fare.helper";
import { sendFcm } from "../utils/sendFcm";

const ACCEPT_RIDE_LUA = `
-- =========================
-- KEYS
-- 1 = ride:{rideId}
-- 2 = ride_accept:{rideId}
-- =========================

-- =========================
-- ARGV
-- 1 = driverId
-- 2 = timestamp (ms)
-- =========================

local rideKey   = KEYS[1]
local acceptKey = KEYS[2]

local driverId  = ARGV[1]
local now       = ARGV[2]

-- 🚫 Ride does not exist
if redis.call("EXISTS", rideKey) == 0 then
  return {0, "RIDE_NOT_FOUND"}
end

-- 🚫 Ride already accepted
if redis.call("EXISTS", acceptKey) == 1 then
  return {0, redis.call("GET", acceptKey)}
end

-- 🚫 Ride already cancelled
local status = redis.call("HGET", rideKey, "status")
if status == "cancelled" then
  return {0, "RIDE_CANCELLED"}
end

-- 🚫 Ride already expired
local expiresAt = redis.call("HGET", rideKey, "expiresAt")
if expiresAt and tonumber(expiresAt) < tonumber(now) then
  return {0, "RIDE_EXPIRED"}
end

-- ✅ Mark ride as accepted (ATOMIC)
redis.call("SET", acceptKey, driverId)
redis.call("HSET", rideKey,
  "status", "accepted",
  "driverId", driverId,
  "acceptedAt", now
)

return {1, driverId}
`;


const OFFER_RIDE_LUA = `
-- KEYS
-- 1 = ride_accept:{rideId}
-- 2 = driver_offer:{driverId}

-- ARGV
-- 1 = rideId
-- 2 = ttlMs

if redis.call("EXISTS", KEYS[1]) == 1 then
  return 0
end

local ok = redis.call("SET", KEYS[2], ARGV[1], "NX", "PX", ARGV[2])
if not ok then
  return 0
end

return 1
`;


const rideSearchControllers = new Map<string, AbortController>();

const SEARCH_INTERVAL_MS = 5000;      // expand every 5s
const OFFER_TTL_MS = 7000;            // driver has 7s to accept
const MAX_SEARCH_TIME_MS = 60000;     // total 1 minute
const INITIAL_RADIUS_KM = 1.0;
const RADIUS_STEP_KM = 0.5;
const MAX_DRIVERS_PER_BATCH = 5;

export interface RideRequestInput {
    phone?: number;
    chatId?: number;
    location: { lat: number; lon: number };
    dropoff?: { lat: number; lon: number; address?: string };
    address?: string;
    type?: string;
}

export const RideService = {
    async requestRide(input: RideRequestInput) {
        console.log("RIDE RECEIVED");

        const { phone, chatId, location, dropoff, address, type } = input;
        if (!phone && !chatId) return;

        // 1️⃣ Persist ride in Mongo (history)
        const ride = await RideRepository.createRide({
            userChatId: chatId,
            userPhoneNumber: phone,
            pickup: { lat: location.lat, lon: location.lon, address },
            dropoff: dropoff
                ? { lat: dropoff.lat, lon: dropoff.lon, address: dropoff.address }
                : undefined,
            status: "pending",
            type,
        });
        console.log("RIDE CREATED");

        const rideId = ride._id.toString();
        const rideKey = `ride:${rideId}`;
        const rideCancelKey = `ride_cancel:${rideId}`;
        const searchLockKey = `ride_search_lock:${rideId}`;

        // 2️⃣ Create authoritativeMAX Redis ride state
        const now = Date.now();
        const RIDE_TTL_SECONDS = 300;

        await redis.hSet(rideKey, {
            phase: "pending",
            createdAt: now.toString(),
            expiresAt: (now + RIDE_TTL_SECONDS * 1000).toString(),

            userChatId: chatId?.toString() ?? "",
            userPhoneNumber: phone?.toString() ?? "",

            pickupLat: location.lat.toString(),
            pickupLon: location.lon.toString(),
            pickupAddress: address ?? "",

            dropoffLat: dropoff?.lat?.toString() ?? "",
            dropoffLon: dropoff?.lon?.toString() ?? "",
            dropoffAddress: dropoff?.address ?? "",

            type: type ?? "",
        });

        await redis.expire(rideKey, RIDE_TTL_SECONDS);
        await redis.del(rideCancelKey);

        // 3️⃣ Acquire distributed search lock
        const lockAcquired = await redis.set(
            searchLockKey,
            "1",
            { NX: true, EX: 60 }
        );

        if (!lockAcquired) {
            console.log(`⚠️ Search already running for ride ${rideId}`);
            return { ride_id: rideId };
        }

        // 4️⃣ Start search
        const controller = new AbortController();
        rideSearchControllers.set(rideId, controller);

        // 4️⃣ Start search (no AbortController anymore)
        this.searchForDrivers(rideId, location, phone, controller.signal)
            .catch(err => console.error("Search failed:", err));

        return { ride_id: rideId };
    },

    async searchForDrivers(
        rideId: string,
        pickup: { lat: number; lon: number },
        phone?: number,
        signal?: AbortSignal
    ) {
        const rideKey = `ride:${rideId}`;
        const rideOffersKey = `ride_offers:${rideId}`;
        const cancelKey = `ride_cancel:${rideId}`;
        const acceptKey = `ride_accept:${rideId}`;

        const startTime = Date.now();
        let radiusKm = INITIAL_RADIUS_KM;

        console.log(`🚀 Starting optimized search for ride ${rideId}`);

        // AbortController from central subscriber signals search stop
        const sleepAbortable = (ms: number) =>
            new Promise<void>((resolve, reject) => {
                if (signal?.aborted) return reject(new Error("Aborted"));
                const onAbort = () => reject(new Error("Aborted"));
                const timeout = setTimeout(() => {
                    signal?.removeEventListener("abort", onAbort);
                    resolve();
                }, ms);
                signal?.addEventListener("abort", onAbort, { once: true });
            });

        try {
            while (Date.now() - startTime < MAX_SEARCH_TIME_MS) {
                if (signal?.aborted) throw new Error("Aborted");

                // Keep search lock alive
                await redis.expire(`ride_search_lock:${rideId}`, 60);

                // Check if ride canceled
                if (await redis.exists(cancelKey)) {
                    console.log(`🛑 Ride ${rideId} canceled, stopping search`);
                    return;
                }

                // Find drivers within current radius
                const drivers = await DriverRepository.findAvailableDrivers(
                    pickup.lat,
                    pickup.lon,
                    radiusKm
                );

                if (!drivers.length) {
                    console.log(`⏭ No drivers in ${radiusKm}km, expanding radius`);
                    radiusKm += RADIUS_STEP_KM;
                    await sleepAbortable(SEARCH_INTERVAL_MS);
                    continue;
                }

                // Batch fetch already offered drivers to reduce Redis round-trips
                const offeredDriversSet = new Set(await redis.sMembers(rideOffersKey));

                // Filter out drivers already offered
                const idleDrivers = drivers
                    .filter(d => !offeredDriversSet.has(d.driver.driverId))
                    .slice(0, MAX_DRIVERS_PER_BATCH);

                if (!idleDrivers.length) {
                    radiusKm += RADIUS_STEP_KM;
                    await sleepAbortable(SEARCH_INTERVAL_MS);
                    continue;
                }

                // Send offers concurrently
                await this.sendOffersBatch(rideId, idleDrivers, OFFER_TTL_MS);

                // Mark drivers as offered in Redis
                const driverIds = idleDrivers.map(c => c.driver.driverId);
                if (driverIds.length > 0) {
                    await redis.sAdd(rideOffersKey, driverIds);
                }

                radiusKm += RADIUS_STEP_KM;
                // await sleepAbortable(SEARCH_INTERVAL_MS);
            }

            // Max search time reached, no drivers found
            console.log(`⏳ No drivers found for ride ${rideId}`);
            await redis.hSet(rideKey, { phase: "expired" });
            await redis.set(cancelKey, "1", { EX: 60 });

            const rideData = await redis.hGetAll(rideKey);
            if (rideData.userPhoneNumber) {
                emitToUser(Number(rideData.userPhoneNumber), "ride_no_drivers", null);
            }

        } catch (err) {
            if ((err as Error).message === "Aborted") {
                console.log(`🛑 Search for ride ${rideId} aborted`);
            } else {
                console.error(`❌ Search failed for ride ${rideId}:`, err);
                throw err;
            }
        } finally {
            // Cleanup
            rideSearchControllers.delete(rideId);
        }
    },


    /**
   * Send ride offers to multiple drivers concurrently and efficiently
   */
    async sendOffersBatch(
        rideId: string,
        candidates: { driver: DriverSession; distKm: number }[],
        ttlMs: number
    ) {
        if (!candidates.length) return;

        const rideKey = `ride:${rideId}`;

        // Fetch ride data once
        const rideData = await redis.hGetAll(rideKey);
        if (!rideData || !rideData.pickupLat) return;

        // Prepare promises for all candidate drivers
        const offerPromises = candidates.map(async (candidate) => {
            const driverId = candidate.driver.driverId;

            // 1️⃣ Attempt atomic offer claim via Lua
            const claimed = await redis.eval(OFFER_RIDE_LUA, {
                keys: [`ride_accept:${rideId}`, `driver_offer:${driverId}`],
                arguments: [rideId, ttlMs.toString()],
            });

            if (claimed !== 1) return null; // someone else accepted or driver busy

            // 2️⃣ Mark driver as offered in Redis (state + rideId)
            const hSetPromise = redis.hSet(`driver:${driverId}`, {
                state: "offered",
                rideId,
            });

            // 3️⃣ Prepare offer payload
            const payload = RideService.buildDriverOfferPayload(rideId, rideData, candidate);

            // 4️⃣ Emit offer concurrently (driver + background)
            const emitPromise = Promise.all([
                emitToDriver(`${driverId}-bg`, "ride_offer", payload),
                emitToDriver(driverId, "ride_offer", payload),
            ]);

            await Promise.all([hSetPromise, emitPromise]);
            return driverId;
        });

        // Wait for all offers to complete
        const results = await Promise.allSettled(offerPromises);

        // Filter out drivers who actually received the offer
        const successfulDrivers = results
            .filter(r => r.status === "fulfilled" && r.value)
            .map(r => (r as PromiseFulfilledResult<string>).value);

        // 5️⃣ Mark successfully offered drivers in ride_offers set in batch
        if (successfulDrivers.length) {
            await redis.sAdd(`ride_offers:${rideId}`, successfulDrivers);
        }

        if (successfulDrivers.length) {
            console.log(`📩 Offers sent to drivers: ${successfulDrivers.join(", ")}`);
        }
    },


    async waitForAcceptance(
        acceptKey: string,
        timeoutMs: number
    ): Promise<boolean> {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (await redis.exists(acceptKey)) return true;
            await sleep(200);
        }
        return false;
    },

    buildDriverOfferPayload(
        rideId: string,
        rideData: Record<string, string>,
        candidate: { distKm: number }
    ) {
        const travelTimeMin = calculateApproxTime(candidate.distKm);

        return {
            type: 'ride_request',
            ride_id: rideId,
            phone: rideData.userPhoneNumber ?? '',
            chatId: rideData.userChatId ?? '',
            pickup: JSON.stringify({
                lat: Number(rideData.pickupLat),
                lon: Number(rideData.pickupLon),
                address: rideData.pickupAddress ?? '',
            }),
            travelDistance: candidate.distKm.toFixed(2),
            travelTime: travelTimeMin.toString(),
        };
    },

    async acceptRide(rideId: string, driverId: string) {
        const rideKey = `ride:${rideId}`;
        const acceptKey = `ride_accept:${rideId}`;
        const now = Date.now();

        const result = await redis.eval(ACCEPT_RIDE_LUA, {
            keys: [rideKey, acceptKey],
            arguments: [driverId, now.toString()],
        });

        const [accepted, winnerDriverId] = result as [number, string];

        if (accepted === 0) {
            // Someone else already accepted
            return {
                success: false,
                winnerDriverId,
            };
        }

        // ✅ THIS DRIVER WON
        await Promise.all([
            redis.hSet(`driver:${driverId}`, { currentRideId: rideId }),
            redis.expire(acceptKey, 600), // safety TTL
        ]);

        // 🔥 STOP SEARCH IMMEDIATELY
        this.stopSearching(rideId);
        await redis.publish(
            "ride.accepted",
            JSON.stringify({ rideId, driverId })
        );

        // 🔔 Notify other drivers (fire-and-forget is OK)
        this.notifyOtherDriversRideTaken(rideId, driverId)
            .catch(err =>
                console.error("Failed to notify other drivers:", err)
            );

        // Notify passenger
        const rideData = await redis.hGetAll(rideKey);
        const driverSession = await driverStoreRedis.get(driverId);
        const userPhone = Number(rideData.userPhoneNumber);

        emitToUser(Number(rideData.userPhoneNumber), "ride_assigned", {
            rideId,
            driverId,
        });

        // 4️⃣ Fire-and-forget: fetch driver info asynchronously
        DriverModel.findById(driverId)
            .then((driver) => {
                emitToUser(userPhone, "ride_assigned", {
                    rideId,
                    driverId,
                    driver,
                    location: driverSession?.location,
                    message: "🚗 Your driver is on the way!",
                });

                emitToUser(userPhone, "ride_accepted", {
                    rideId,
                    driverId,
                    driver,
                    location: driverSession?.location,
                    message: "🚗 Your driver is on the way!",
                });
            })
            .catch((err) => {
                console.error("Failed to fetch driver for notification:", err);
                // optionally still notify user without driver details
                emitToUser(userPhone, "ride_assigned", {
                    rideId,
                    driverId,
                    driver: null,
                    location: rideData.driverLocation,
                    message: "🚗 Your driver is on the way!",
                });
            });

        return {
            success: true,
            rideId,
            driverId,
        };
    },

    stopSearching(rideId: string) {
        const controller = rideSearchControllers.get(rideId);
        controller?.abort();
        rideSearchControllers.delete(rideId);
    },


    async completeRide(driverId: string, data: RideCompletedPayload) {
        const { rideId, distance, fare } = data;
        const rideKey = `ride:${rideId}`;
        const acceptKey = `ride_accept:${rideId}`;
        const driverKey = `driver:${driverId}`;

        // 1️⃣ Verify ride exists and driver actually accepted it
        const rideData = await redis.hGetAll(rideKey);
        if (!rideData || !rideData.driverId || rideData.driverId !== driverId) {
            throw new Error(`Ride ${rideId} not assigned to driver ${driverId}`);
        }

        // 2️⃣ Update ride state in Redis atomically
        const now = Date.now();
        await redis.hSet(rideKey, {
            status: "completed",
            endedAt: now.toString(),
            distance: distance.toString(),
            fare: fare.toString(),
            phase: "completed",
        });

        // Optional: expire ride accept key after completion
        await redis.del(acceptKey);

        // 3️⃣ Clear driver's current ride in Redis
        await redis.hSet(driverKey, { currentRideId: "" });

        // 4️⃣ Update ride in MongoDB
        await RideModel.findOneAndUpdate(
            { _id: rideId },
            {
                endedAt: new Date(),
                distanceTraveled: distance,
                fare,
                status: "completed",
            }
        );

        // 5️⃣ Update driver in MongoDB (clear currentRideId)
        const updatedDriver = await DriverModel.findOneAndUpdate(
            { _id: driverId },
            { currentRideId: null },
            { new: true }
        );

        // 6️⃣ Deduct commission & update driver balance
        const commissionResult = await handleRideCommission(driverId, rideId);
        const { balance, commission } = commissionResult;

        // Notify driver about commission update if FCM token exists
        if (updatedDriver?.fcmToken) {
            sendFcm(updatedDriver.fcmToken, commission);
        }

        // 7️⃣ Notify passenger that ride is completed
        const userPhoneNumber = rideData.userPhoneNumber;
        if (userPhoneNumber) {
            emitToUser(Number(userPhoneNumber), "ride_completed", {
                rideId,
                distance,
                fare,
                driverId,
            });
        }

        return {
            success: true,
            rideId,
            driverId,
            distance,
            fare,
            commission,
            balance,
        };
    },

    async notifyOtherDriversRideTaken(rideId: string, winnerDriverId: string) {
        const rideOffersKey = `ride_offers:${rideId}`;

        const offeredDriverIds = await redis.sMembers(rideOffersKey);
        if (!offeredDriverIds.length) return;

        const losers = offeredDriverIds.filter(id => id !== winnerDriverId);

        if (!losers.length) return;

        await Promise.all(
            losers.map(driverId =>
                Promise.all([
                    emitToDriver(driverId, "ride_already_taken", { rideId }),
                    emitToDriver(`${driverId}-bg`, "ride_already_taken", { rideId }),

                    // Optional: clear offered state
                    redis.hSet(`driver:${driverId}`, {
                        state: "idle",
                        rideId: "",
                    }),
                ])
            )
        );

        console.log(
            `🚫 ride_already_taken sent to drivers: ${losers.join(", ")}`
        );
    },


    async notifyOtherDriversRideCancelled(rideId: string) {
        const rideOffersKey = `ride_offers:${rideId}`;

        const offeredDriverIds = await redis.sMembers(rideOffersKey);
        if (!offeredDriverIds.length) return;


        if (!offeredDriverIds.length) return;

        await Promise.all(
            offeredDriverIds.map(driverId =>
                Promise.all([
                    emitToDriver(driverId, "ride_cancelled", { rideId }),
                    emitToDriver(`${driverId}-bg`, "ride_cancelled", { rideId }),

                    // Optional: clear offered state
                    redis.hSet(`driver:${driverId}`, {
                        state: "idle",
                        rideId: "",
                    }),
                ])
            )
        );

        console.log(
            `🚫 ride_already_taken sent to drivers: ${offeredDriverIds.join(", ")}`
        );
    }

}