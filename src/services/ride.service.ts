import { RideRepository } from "../repositories/ride.repository";
import { DriverRepository } from "../repositories/driver.repository";
import { DriverModel } from "../models/DriverModel";
import { DriverLocation } from "../types/location";
import { sendOfferToDrivers } from "../utils/sendOfferToNextDriver";
import { safeAsync } from "../utils/asyncHelper";
import { RideModel } from "../models/Ride";
import { driverStore } from "../store/driverStore";
import { socketIo, userSockets } from "../gateway/socket.maps";
import { RideCompletedPayload } from "../bot/socket/types";
import { emitToDriver, emitToUser, updateRideStatus } from "../gateway/ride.socket";
import { handleRideCommission } from "../utils/fare.helper";
import { PassengerModel } from "../models/PassengerModel";
import { getSession } from "../bot/services/sessionManager";
import { sendFcm } from "../utils/sendFcm";
import { driverStoreRedis } from "../store/driverStoreRedis";
import { redis } from "../redis/redisClient";
import { RideRequestInput } from "../modules/ride/ride.types";

// Lua script to atomically accept a ride
const ACCEPT_MULTI_LUA = `
-- KEYS[1] = ride key (ride:{rideId})
-- KEYS[2] = ride offers set (ride_offers:{rideId})
-- ARGV[1] = driverId
-- ARGV[2] = now timestamp (ms)

local status = redis.call("HGET", KEYS[1], "status")

-- Already accepted
if status == "accepted" then
  local winner = redis.call("HGET", KEYS[1], "driverId")
  return {0, winner}  -- 0 = fail, winner driverId
end

-- If pending/offered, accept
redis.call("HSET", KEYS[1],
  "status", "accepted",
  "driverId", ARGV[1],
  "acceptedAt", ARGV[2]
)

-- Remove this ride from all other drivers' offer sets
local otherDrivers = redis.call("SMEMBERS", KEYS[2])
for i, dId in ipairs(otherDrivers) do
  redis.call("SREM", "driver:"..dId..":offers", KEYS[1])
end

-- Delete ride_offers set
redis.call("DEL", KEYS[2])

return {1, ARGV[1]}  -- 1 = success, driverId
`;

const rideSearchControllers = new Map<string, AbortController>();

type SearchResult = {
    drivers: any[] | 0; // replace `any` with your actual driver type
    message: string;
};



export interface RideOfferPaylod {
    id: string;
    pickup: DriverLocation;
    userPhoneNumber?: number;
    userChatId: number;
    travelDistance: string;
    travelTime: number;
    fcmToken?: string | undefined;
    driverId: string;
}


export const RideService = {

    async searchForDrivers(
        rideId: string,
        pickup: { lat: number; lon: number },
        phone: number | undefined,
        signal: AbortSignal
    ): Promise<SearchResult> {
        const MAX_DURATION = 1 * 60 * 1000;
        const INTERVAL = 5000;
        const start = Date.now();

        console.log(`🚀 Starting driver search for rideId: ${rideId}`);

        return new Promise<SearchResult>(async (resolve) => {
            let interval: NodeJS.Timeout;

            const stop = (result?: SearchResult) => {
                clearInterval(interval);
                resolve(result ?? { drivers: 0, message: "Search aborted" });
            };

            signal.addEventListener("abort", () => {
                console.log(`🛑 Search aborted for rideId: ${rideId}`);
                stop();
            });

            const checkDrivers = async () => {
                if (signal.aborted) return;

                const elapsed = Date.now() - start;
                console.log(`⏱️ Elapsed time: ${(elapsed / 1000).toFixed(1)}s`);

                if (elapsed >= MAX_DURATION) {
                    await RideRepository.updateRide(rideId, { status: "cancelled" });
                    emitToUser(phone, "ride_no_drivers", null);

                    console.log(`⏳ Timeout reached for ride ${rideId}`);
                    return stop({ drivers: 0, message: "No drivers found after 3 minutes" });
                }

                const ride = await RideModel.findById(rideId);
                if (!ride || ride.status.includes("cancelled")) {
                    console.log(`❌ Ride ${rideId} cancelled`);
                    return stop();
                }

                console.log(`🔍 Searching drivers near (${pickup.lat}, ${pickup.lon})`);
                const drivers = await DriverRepository.findAvailableDrivers(
                    pickup.lat,
                    pickup.lon,
                    2,
                    []
                );

                if (!drivers.length) {
                    console.log(`🚫 No drivers available`);
                    return;
                }

                const nearest = drivers[0];

                await RideRepository.updateRide(rideId, {
                    candidateDrivers: drivers.map(d => ({
                        driverId: d.driver.driverId,
                        distKm: d.distKm,
                    })),
                    driverId: nearest.driver.driverId,
                });

                sendOfferToDrivers(rideId);
            };

            await checkDrivers();
            interval = setInterval(checkDrivers, INTERVAL);
        });
    },

    async requestRide(input: RideRequestInput) {
        const { phone, chatId, pickup, dropoff, address, type } = input;
        if (!phone && !chatId) return;

        // 1️⃣ Create ride in MongoDB (persistent)
        const ride = await RideRepository.createRide(input);

        if (!ride) return;

        const rideId = ride._id.toString();
        const rideKey = `ride:${rideId}`;
        const rideOffersKey = `ride_offers:${rideId}`;

        // 2️⃣ Save ride in Redis
        await redis.hSet(rideKey, {
            status: "pending",
            type: type ?? "",                    // default empty string if undefined
            userChatId: chatId?.toString() ?? "", // convert number|undefined to string
            userPhoneNumber: phone?.toString() ?? "",
            pickupLat: pickup.lat.toString(),
            pickupLon: pickup.lon.toString(),
            pickupAddress: address ?? "",
            dropoffLat: dropoff?.lat.toString() ?? "",
            dropoffLon: dropoff?.lon.toString() ?? "",
            dropoffAddress: dropoff?.address ?? "",
        });

        // Optional: expire ride in Redis after 3-5 minutes
        await redis.expire(rideKey, 300);

        // 3️⃣ Initialize ride_offers set (empty initially)
        await redis.del(rideOffersKey); // ensure clean slate

        // 4️⃣ Start background driver search
        const controller = new AbortController();
        rideSearchControllers.set(rideId, controller);

        this.searchForDrivers(rideId, pickup, phone, controller.signal)
            .catch((err) => console.error("Background search failed:", err));

        return { ride_id: rideId };
    },

    async acceptRide(
        rideId: string,
        driverId: string
    ) {
        const rideKey = `ride:${rideId}`;
        const rideOffersKey = `ride_offers:${rideId}`;
        const now = Date.now();

        const [err, result] = await safeAsync(() =>
            redis.eval(ACCEPT_MULTI_LUA, {
                keys: [rideKey, rideOffersKey],
                arguments: [driverId, now.toString()],
            })
        );

        if (err) throw new Error(`Redis error: ${err.message}`);

        const [accepted, winner] = result as [number, string];

        if (accepted === 0) {
            // Ride already accepted by another driver
            return { success: false, winnerDriverId: winner };
        }

        // Ride successfully accepted by this driver
        // 1️⃣ Update driver current ride
        await redis.hSet(`driver:${driverId}`, { currentRideId: rideId });
        await redis.del(`driver:${driverId}:offers`);

        RideService.stopSearching(rideId);
        driverStoreRedis.clearOffer(driverId);

        // 2️⃣ Notify passenger
        const rideData = await redis.hGetAll(rideKey);
        const userPhone = Number(rideData.userPhoneNumber);
        const driverSession = await driverStoreRedis.get(driverId);

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

        return { success: true, rideData };
    },



    stopSearching(rideId: string) {
        //// 🔥 STOP SEARCH IMMEDIATELY
        const controller = rideSearchControllers.get(rideId);
        controller?.abort();
        rideSearchControllers.delete(rideId);
    },

    async completeRide(driverId: string, data: RideCompletedPayload) {
        const { rideId, distance, fare } = data;

        // 1. Validate and update ride status
        const [rideErr, ride] = await safeAsync(() =>
            updateRideStatus(rideId, "completed")
        );
        if (rideErr) throw new Error(`Failed to update ride status: ${rideErr.message}`);
        if (!ride) throw new Error(`Ride ${rideId} not found`);

        // Sync driver store
        driverStoreRedis.upsert(driverId, { currentRideId: null });

        // 2. Update ride fields (endedAt, fare, distance)
        const [updateRideErr] = await safeAsync(() =>
            RideModel.findOneAndUpdate(
                { _id: rideId },
                {
                    endedAt: new Date(),
                    fare,
                    distanceTraveled: distance,
                }
            )
        );

        if (updateRideErr)
            throw new Error(
                `Failed to update ride details for ${rideId}: ${updateRideErr.message}`
            );

        const rideUpdte = await RideModel.findOne({ _id: rideId });
        // 3. Update driver in DB (clear currentRideId)
        const [updateDriverErr, updatedDriver] = await safeAsync(() =>
            DriverModel.findOneAndUpdate({ _id: driverId }, { currentRideId: null })
        );
        if (updateDriverErr)
            throw new Error(
                `Failed to update driver ${driverId}: ${updateDriverErr.message}`
            );

        // 4. Deduct commission & update balance
        const [commissionErr, commissionResult] = await safeAsync(() =>
            handleRideCommission(driverId, Number(data.fare))
        );
        if (commissionErr)
            throw new Error(
                `Failed to process commission for ride ${rideId}: ${commissionErr.message}`
            );

        const { balance, commission } = commissionResult!;
        if (updatedDriver?.fcmToken) sendFcm(updatedDriver?.fcmToken, commission);

        // 6. Notify user (if online)
        emitToUser(ride.userPhoneNumber, "ride_completed", data);
    }
};


