import { RideCompletedPayload } from "../bot/socket/types";
import { sleep } from "../bot/utils/helpers";
import { emitToDriver, emitToUser } from "../gateway/ride.socket";
import { DriverModel } from "../models/DriverModel";
import { RideModel } from "../models/Ride";
import { redis } from "../redis/redisClient";
import { DriverRepository } from "../repositories/driver.repository";
import { RideRepository } from "../repositories/ride.repository";
import { driverStoreRedis } from "../store/driverStoreRedis";
import { calculateApproxTime } from "../utils/calculateApproxTime";
import { handleRideCommission } from "../utils/fare.helper";
import { sendFcm } from "../utils/sendFcm";

enum RideSearchMode {
    SEQUENTIAL = "sequential", // current behavior
    PARALLEL = "parallel"      // new behavior
}

type DriverCandidate = {
    driver: {
        driverId: string;
    };
    distKm: number;
};


const ACCEPT_RIDE_LUA = `
-- =========================
-- KEYS
-- 1 = ride:{rideId}
-- 2 = ride_accept:{rideId}
-- 3 = ride_reservation:{rideId}:{driverId}
-- =========================
-- ARGV
-- 1 = driverId
-- 2 = now (ms)
-- =========================

-- Ride missing
if redis.call("EXISTS", KEYS[1]) == 0 then
  return {0, "RIDE_NOT_FOUND"}
end

-- Already accepted
if redis.call("EXISTS", KEYS[2]) == 1 then
  return {0, redis.call("GET", KEYS[2])}
end

-- Reservation invalid
if redis.call("EXISTS", KEYS[3]) == 0 then
  return {0, "NOT_RESERVED_FOR_YOU"}
end

-- Ride cancelled or expired
local phase = redis.call("HGET", KEYS[1], "phase")
if phase == "cancelled" or phase == "expired" then
  return {0, "RIDE_NOT_ACTIVE"}
end

local expiresAt = redis.call("HGET", KEYS[1], "expiresAt")
if expiresAt and tonumber(expiresAt) < tonumber(ARGV[2]) then
  return {0, "RIDE_EXPIRED"}
end

-- Accept ride
redis.call("SET", KEYS[2], ARGV[1], "PX", 600000)

redis.call("HSET", KEYS[1],
  "status", "accepted",
  "driverId", ARGV[1],
  "acceptedAt", ARGV[2]
)

return {1, ARGV[1]}
`;

const RESERVE_RIDE_LUA = `
-- version: 2
-- =========================
-- KEYS
-- 1 = ride_reservation:{rideId}:{driverId}
-- 2 = driver_offer:{driverId}
-- =========================
-- ARGV
-- 1 = driverId
-- 2 = rideId
-- 3 = ttlMs
-- =========================

-- Driver busy
if redis.call("EXISTS", KEYS[2]) == 1 then
  return 0
end

-- Reserve the ride for this driver
redis.call("SET", KEYS[1], ARGV[1], "PX", ARGV[3])

-- Set driver_offer key
redis.call("SET", KEYS[2], ARGV[2], "PX", ARGV[3])

return 1
`

const rideSearchControllers = new Map<string, AbortController>();

const SEARCH_INTERVAL_MS = 5000;      // expand every 5s
const OFFER_TTL_MS = 10000;            // driver has 7s to accept
const MAX_SEARCH_TIME_MS = 60000;     // total 1 minute
const INITIAL_RADIUS_KM = 0.5;
const RADIUS_STEP_KM = 0.5;
const PARALLEL_MAX_DRIVERS = 3;
const PARALLEL_PICK_WINDOW_MS = 500;
const PARALLEL_RADIUS_EXPAND_MS = 15000;
const STAGE_WAIT_MS = 5000;
const STAGE3_BURST_COUNT = 40;
const STAGE4_BATCH_COUNT = 40;
const STAGE4_EXPAND_EVERY_MS = 5000;
const STAGE1_2_RADIUS_KM = 0.8;
const STAGE3_RADIUS_KM = 1.5;
const STAGE1_2_WAIT_MS = 5000;

export interface RideRequestInput {
    phone?: number;
    chatId?: number;
    location: { lat: number; lon: number };
    dropoff?: { lat: number; lon: number; address?: string };
    address?: string;
    type?: string;
    isPremium?: boolean;
    options?: string[];
    rideType?: string;
}

const SEARCH_MODE: RideSearchMode =
    RideSearchMode.SEQUENTIAL;

export const RideService = {

    async requestRide(input: RideRequestInput) {
        const { phone, chatId, location, dropoff, address, type, rideType, options } = input;
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
            rideType,
        });

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
            rideType: rideType ?? "standard",
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
        // this.searchForDrivers(rideId, location, phone, controller.signal)
        //     .catch(err => console.error("Search failed:", err));
        console.timeEnd("mongo.createRide");

        this.searchForDriversSequential(rideId, location, phone, controller.signal, options).catch((err) => {
            // Abort is expected on cancel/accept
            if (err?.message === "Aborted") return;
            console.error("Search failed:", err);
        });;
        return { ride_id: rideId };
    },

    async searchForDriversSequential(
        rideId: string,
        pickup: { lat: number; lon: number },
        phone?: number,
        signal?: AbortSignal,
        options?: string[]
    ) {
        const rideKey = `ride:${rideId}`;
        const cancelKey = `ride_cancel:${rideId}`;
        const acceptKey = `ride_accept:${rideId}`;
        const startTime = Date.now();

        // Prevent re-offering the same driver across stages
        const attemptedDriverIds = new Set<string>();

        console.log(`🚀 Starting 4-stage sequential escalation for ride ${rideId}`);

        const isExpired = () => Date.now() - startTime >= MAX_SEARCH_TIME_MS;

        const checkStopConditions = async () => {
            if (signal?.aborted) return true;

            await redis.expire(`ride_search_lock:${rideId}`, 60);

            if (await redis.exists(cancelKey)) {
                console.log(`🛑 Ride ${rideId} cancelled`);
                return true;
            }

            // someone already accepted?
            const accepted = await redis.get(acceptKey);
            if (accepted) return true;

            if (isExpired()) return true;

            return false;
        };

        const fetchCandidates = async (radius: number) => {
            const drivers = await DriverRepository.findAvailableDrivers(
                pickup.lat,
                pickup.lon,
                radius,
                options ?? []
            );

            return drivers.sort((a, b) => a.distKm - b.distKm);
        };

        const reserveAndEmit = async (
            candidate: DriverCandidate,
            rideData: Record<string, string>,
            ttlMs: number
        ) => {
            const driverId = candidate.driver.driverId;

            const reservationKey = `ride_reservation:${rideId}:${driverId}`;
            const driverOfferKey = `driver_offer:${driverId}`;
            const offeredSetKey = `ride_offered:${rideId}`;

            const reserved = await redis.eval(RESERVE_RIDE_LUA, {
                keys: [reservationKey, driverOfferKey],
                arguments: [driverId, rideId, ttlMs.toString()],
            });

            if (reserved !== 1) {
                return { ok: false as const, driverId };
            }

            const payload = RideService.buildDriverOfferPayload(rideId, rideData, candidate);

            await Promise.all([
                emitToDriver(driverId, "ride_offer", payload),
                emitToDriver(`${driverId}-bg`, "ride_offer", payload),
            ]);

            await redis
                .multi()
                .sAdd(offeredSetKey, driverId)
                .expire(offeredSetKey, 300) // or MAX_SEARCH_TIME_MS/1000 rounded up
                .exec();

            console.log(`🔐 Offered ride ${rideId} to driver ${driverId} (ttl=${ttlMs}ms)`);
            return { ok: true as const, driverId };
        };



        const cleanupOffer = async (driverId: string) => {
            const reservationKey = `ride_reservation:${rideId}:${driverId}`;
            const driverOfferKey = `driver_offer:${driverId}`;

            await Promise.all([
                redis.del(reservationKey),
                redis.del(driverOfferKey),
                emitToDriver(driverId, "ride_already_taken", { rideId }),
                emitToDriver(`${driverId}-bg`, "ride_already_taken", { rideId }),
            ]);
        };

        const offerOneAndWait = async (radius: number): Promise<string | null> => {
            const rideData = await redis.hGetAll(rideKey);

            const candidates = await fetchCandidates(radius);
            const next = candidates.find(c => !attemptedDriverIds.has(c.driver.driverId));
            if (!next) return null;

            const driverId = next.driver.driverId;
            attemptedDriverIds.add(driverId);

            const { ok } = await reserveAndEmit(next, rideData, OFFER_TTL_MS);
            if (!ok) return null;

            const acceptedDriverId = await this.waitForAcceptanceWithFallback(
                rideId,
                driverId,
                STAGE1_2_WAIT_MS
            );

            if (acceptedDriverId) return acceptedDriverId;

            if (!(await redis.get(acceptKey))) {
                await cleanupOffer(driverId);
            }

            return null;
        };


        const offerAllAndWaitUntilTimeout = async (radius: number): Promise<string | null> => {
            const rideData = await redis.hGetAll(rideKey);

            const candidates = (await fetchCandidates(radius))
                .filter(c => !attemptedDriverIds.has(c.driver.driverId));

            if (!candidates.length) return null;

            candidates.forEach(c => attemptedDriverIds.add(c.driver.driverId));

            // TTL should last until the end (cap it so we don't set crazy values)
            const remainingMs = Math.max(0, MAX_SEARCH_TIME_MS - (Date.now() - startTime));
            const ttlMs = Math.min(Math.max(remainingMs, 3000), MAX_SEARCH_TIME_MS);

            const results = await Promise.all(
                candidates.map(c => reserveAndEmit(c, rideData, ttlMs))
            );

            const offeredIds = results.filter(r => r.ok).map(r => r.driverId);
            if (!offeredIds.length) return null;

            // Wait until overall timeout (or acceptance)
            const acceptedDriverId = await this.waitForAcceptanceWithFallback(
                rideId,
                "*",
                remainingMs
            );

            if (acceptedDriverId) return acceptedDriverId;

            if (!(await redis.get(acceptKey))) {
                await Promise.all(offeredIds.map(cleanupOffer));
            }

            return null;
        };

        // --- Stage 1: nearest 1 within 0.8km, wait 5s ---
        if (!(await checkStopConditions())) {
            const accepted = await offerOneAndWait(STAGE1_2_RADIUS_KM);
            if (accepted) return;
        }

        // --- Stage 2: next nearest 1 within 0.8km, wait 5s ---
        if (!(await checkStopConditions())) {
            const accepted = await offerOneAndWait(STAGE1_2_RADIUS_KM);
            if (accepted) return;
        }

        // --- Stage 3: ALL drivers within 1.5km at once, wait until overall timeout ---
        if (!(await checkStopConditions())) {
            const accepted = await offerAllAndWaitUntilTimeout(STAGE3_RADIUS_KM);
            if (accepted) return;
        }

        // Final: expired / cancelled / accepted elsewhere
        if (await redis.get(acceptKey)) {
            console.log(`✅ Ride ${rideId} accepted (detected via acceptKey)`);
            return;
        }

        if (await redis.exists(cancelKey)) return;

        console.log(`⏳ Ride ${rideId} expired — no drivers`);
        await redis.hSet(rideKey, { phase: "expired" });
        await redis.set(cancelKey, "1", { EX: 60 });

        const rideData = await redis.hGetAll(rideKey);
        if (rideData.userPhoneNumber) {
            emitToUser(Number(rideData.userPhoneNumber), "ride_no_drivers", null);
        }
    },

    nextDriver(
        drivers: DriverCandidate[],
        lastDriverId: string | null
    ): DriverCandidate | null {
        if (!drivers.length) return null;

        if (!lastDriverId) return drivers[0];

        const idx = drivers.findIndex(
            d => d.driver.driverId === lastDriverId
        );

        // if last driver not found (e.g. driver list changed)
        if (idx === -1) return drivers[0];

        return drivers[(idx + 1) % drivers.length];
    },

    async searchForDriversParallel(
        rideId: string,
        pickup: { lat: number; lon: number },
        phone?: number,
        signal?: AbortSignal,
        options?: string[]
    ) {
        const rideKey = `ride:${rideId}`;
        const cancelKey = `ride_cancel:${rideId}`;
        const acceptKey = `ride_accept:${rideId}`;
        const startTime = Date.now();

        let radiusKm = INITIAL_RADIUS_KM;
        let lastRadiusExpand = Date.now();

        console.log(`🚀 Parallel search started for ride ${rideId}`);

        while (Date.now() - startTime < MAX_SEARCH_TIME_MS) {
            if (signal?.aborted) return;

            if (await redis.exists(cancelKey)) return;

            // 🔁 Expand radius every 15s
            if (Date.now() - lastRadiusExpand >= PARALLEL_RADIUS_EXPAND_MS) {
                radiusKm += RADIUS_STEP_KM;
                lastRadiusExpand = Date.now();
                console.log(`📡 Expanding radius to ${radiusKm}km`);
            }

            // 1️⃣ Fetch candidates
            const drivers = await DriverRepository.findAvailableDrivers(
                pickup.lat,
                pickup.lon,
                radiusKm,
                options ?? [],
            );

            if (!drivers.length) {
                await sleep(500);
                continue;
            }

            // 2️⃣ Pick closest N drivers
            const selected = drivers
                .sort((a, b) => a.distKm - b.distKm)
                .slice(0, PARALLEL_MAX_DRIVERS);

            // 3️⃣ Try reserving all of them
            const reservedDrivers: DriverCandidate[] = [];

            for (const candidate of selected) {
                const driverId = candidate.driver.driverId;

                const ok = await redis.eval(RESERVE_RIDE_LUA, {
                    keys: [
                        `ride_reservation:${rideId}:${driverId}`,
                        `driver_offer:${driverId}`,
                    ],
                    arguments: [
                        driverId,
                        rideId,
                        OFFER_TTL_MS.toString(),
                    ],
                });

                if (ok === 1) {
                    reservedDrivers.push(candidate);
                }
            }

            if (!reservedDrivers.length) {
                await sleep(300);
                continue;
            }

            // 4️⃣ Emit offers in parallel
            const rideData = await redis.hGetAll(rideKey);
            console.log(rideData);

            await Promise.all(
                reservedDrivers.map(candidate => {
                    const driverId = candidate.driver.driverId;
                    const payload = RideService.buildDriverOfferPayload(
                        rideId,
                        rideData,
                        candidate
                    );

                    return Promise.all([
                        emitToDriver(driverId, "ride_offer", payload),
                        emitToDriver(`${driverId}-bg`, "ride_offer", payload),
                    ]);
                })
            );

            // 5️⃣ Wait for FIRST acceptance
            const acceptedDriverId =
                await this.waitForAcceptanceWithFallback(
                    rideId,
                    "*",
                    OFFER_TTL_MS
                );

            if (acceptedDriverId) {
                console.log(`✅ Ride accepted by ${acceptedDriverId}`);
                return;
            }

            // 6️⃣ Cleanup timed-out offers
            await Promise.all(
                reservedDrivers.map(c => {
                    const driverId = c.driver.driverId;
                    return Promise.all([
                        redis.del(`ride_reservation:${rideId}:${driverId}`),
                        // redis.del(`driver_offer:${driverId}`), TODO: delete expiration only if there are no other drivers. and if this driver presses skip  let it expire
                        emitToDriver(driverId, "ride_already_taken", { rideId }),
                    ]);
                })
            );

            await sleep(300);
        }

        console.log(`❌ Ride ${rideId} expired`);
        await redis.hSet(rideKey, { phase: "expired" });
    },



    async waitForAcceptanceWithFallback(
        rideId: string,
        driverId: string,
        timeoutMs: number
    ): Promise<string | null> {
        const acceptKey = `ride_accept:${rideId}`;

        // 1️⃣ Fast check: maybe driver already accepted
        const acceptedDriverId = await redis.get(acceptKey);
        if (acceptedDriverId) return acceptedDriverId;

        // 2️⃣ Subscribe to acceptance event
        return new Promise(async (resolve, reject) => {
            const subscriber = redis.duplicate();
            await subscriber.connect();

            const timeout = setTimeout(async () => {
                await subscriber.disconnect();
                resolve(null);
            }, timeoutMs);

            await subscriber.subscribe("ride.accepted", async (message) => {
                try {
                    const data = JSON.parse(message);
                    if (data.rideId === rideId) {
                        clearTimeout(timeout);
                        await subscriber.unsubscribe("ride.accepted");
                        await subscriber.disconnect();
                        resolve(data.driverId);
                    }
                } catch (err) {
                    console.error("Failed parsing ride.accepted message", err);
                }
            });
        });
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
            rideType: rideData.rideType ?? "standard",
        };
    },

    async acceptRide(rideId: string, driverId: string) {
        const offeredSetKey = `ride_offered:${rideId}`;
        const rideKey = `ride:${rideId}`;
        const acceptKey = `ride_accept:${rideId}`;
        const reservationKey = `ride_reservation:${rideId}:${driverId}`;
        const driverOfferKey = `driver_offer:${driverId}`;
        const now = Date.now();

        // 1) Lua
        const result = await redis.eval(ACCEPT_RIDE_LUA, {
            keys: [rideKey, acceptKey, reservationKey],
            arguments: [driverId, now.toString()],
        });

        const [accepted, reasonOrWinner] = result as [number, string];
        if (accepted === 0) return { success: false, reason: reasonOrWinner };

        // ✅ update Mongo driverId without awaiting
        void RideModel.findByIdAndUpdate(
            rideId,
            { driverId, status: "accepted", acceptedAt: new Date() },
        ).exec().catch(err => console.error("Mongo ride update failed:", err));

        // 2) Stop searching (non-Redis; keep as you prefer)
        this.stopSearching(rideId);

        await this.notifyOfferedDriversSearchStopped({
            rideId,
            reason: "accepted",
            winnerDriverId: driverId,
            cleanupKeys: true,
            deleteOfferedSet: true,
        });

        // 3+4+5+6) ONE round-trip for cleanup + state + publish + fetch fields
        // (Remove redundant expire; avoid HGETALL)
        const tx = redis
            .multi()
            .del(reservationKey)
            .del(driverOfferKey)
            // NOTE: Lua already wrote acceptedAt/status/driverId — only write what Lua did NOT write.
            // If you need "phase" specifically and Lua wrote "status", pick one schema.
            .hSet(rideKey, { phase: "accepted" }) // or remove if unnecessary
            .hSet(`driver:${driverId}`, { currentRideId: rideId, state: "busy" })
            .publish("ride.accepted", JSON.stringify({ rideId, driverId }))
            .hmGet(rideKey, "userPhoneNumber");

        const execRes = await tx.exec(); // array of results in the same order

        const hmgetRes = execRes?.[5] as unknown; // 0-based index; hmGet is last here
        const userPhoneNumber =
            Array.isArray(hmgetRes) ? hmgetRes[0] : (hmgetRes as any)?.[0];

        // driverStoreRedis might be another redis instance; run in parallel if so:
        const driverSessionPromise = driverStoreRedis.get(driverId);

        const userPhone = Number(userPhoneNumber);
        emitToUser(userPhone, "ride_assigned", { rideId, driverId });

        const driverSession = await driverSessionPromise;

        DriverModel.findById(driverId)
            .then(driver => {
                emitToUser(userPhone, "ride_assigned", {
                    rideId, driverId, driver,
                    location: driverSession?.location,
                    message: "🚗 Your driver is on the way!",
                });
                emitToUser(userPhone, "ride_accepted", {
                    rideId, driverId, driver,
                    location: driverSession?.location,
                    message: "🚗 Your driver is on the way!",
                });
            })
            .catch(err => console.error("Failed to fetch driver info:", err));

        return { success: true, rideId, driverId };
    },

    async notifyOfferedDriversSearchStopped(params: {
        rideId: string;
        reason: "accepted" | "cancelled" | "expired";
        winnerDriverId?: string;        // present when accepted
        cleanupKeys?: boolean;          // default true
        deleteOfferedSet?: boolean;     // default true
    }) {
        const {
            rideId,
            reason,
            winnerDriverId,
            cleanupKeys = true,
            deleteOfferedSet = true,
        } = params;

        const offeredSetKey = `ride_offered:${rideId}`;
        const offeredDriverIds = await redis.sMembers(offeredSetKey);

        if (!offeredDriverIds?.length) return;

        const notifyIds = winnerDriverId
            ? offeredDriverIds.filter(id => id && id !== winnerDriverId)
            : offeredDriverIds.filter(id => id);

        await Promise.all(
            notifyIds.map(async (id) => {
                if (cleanupKeys) {
                    await redis
                        .multi()
                        .del(`ride_reservation:${rideId}:${id}`)
                        .del(`driver_offer:${id}`)
                        .exec();
                }

                const payload = {
                    rideId,
                    reason,
                    ...(winnerDriverId ? { winnerDriverId } : {}),
                };

                await Promise.all([
                    emitToDriver(id, "ride_search_stopped", payload),
                    emitToDriver(`${id}-bg`, "ride_search_stopped", payload),
                ]);
            })
        );

        if (deleteOfferedSet) {
            await redis.del(offeredSetKey);
        }
    },


    stopSearching(rideId: string) {
        const controller = rideSearchControllers.get(rideId);
        controller?.abort();
        rideSearchControllers.delete(rideId);
    },

    async completeRideGhostRide(driverId: string, data: RideCompletedPayload) {
        // 5️⃣ Update driver in MongoDB (clear currentRideId)
        const updatedDriver = await DriverModel.findOneAndUpdate(
            { _id: driverId },
            { currentRideId: null },
            { new: true }
        );


        const commissionResult = await handleRideCommission(driverId, Number(data.fare));
        const { balance, commission } = commissionResult;

        // Notify driver about commission update if FCM token exists
        if (updatedDriver?.fcmToken) {
            sendFcm(updatedDriver.fcmToken, commission);
        }
    },

    async completeRide(driverId: string, data: RideCompletedPayload) {
        const { rideId, distance, fare } = data;
        const rideKey = `ride:${rideId}`;
        const acceptKey = `ride_accept:${rideId}`;
        const driverKey = `driver:${driverId}`;

        // 3️⃣ Clear driver's current ride in Redis
        await redis.hSet(driverKey, { currentRideId: "" });

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
        const commissionResult = await handleRideCommission(driverId, Number(data.fare));
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
}