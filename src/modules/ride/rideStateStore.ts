import { redis } from "../../redis/redisClient";
import { RideConfig } from "./ride.config";
import { RideKeys } from "./ride.keys";
import { RideRequestInput, RideState } from "./ride.types";

export type StopReason = "cancelled" | "accepted" | "expired" | "aborted" | null;

export class RideStateStore {

    // Centralize all keys here (no more `ride:${rideId}` scattered)
    keys(rideId: string) {
        return {
            ride: `ride:${rideId}`,
            cancel: `ride_cancel:${rideId}`,
            accept: `ride_accept:${rideId}`,
            offered: `ride_offered:${rideId}`,
            lock: `ride_search_lock:${rideId}`,
            reservation: (driverId: string) => `ride_reservation:${rideId}:${driverId}`,
        };
    }

    // buildInitialState(input: RideRequestInput): RideState {
    //     const { phone, pickup, dropoff, address, rideType } = input;
    //     const now = Date.now();
    //     const expiresAt = now + RideConfig.RIDE_TTL_SECONDS * 1000;

    //     return {
    //         phase: "pending",
    //         createdAt: String(now),
    //         expiresAt: String(expiresAt),

    //         userChatId: chatId ? String(chatId) : "",
    //         userPhoneNumber: phone ? String(phone) : "",

    //         pickupLat: String(pickup.lat),
    //         pickupLon: String(pickup.lon),
    //         pickupAddress: address ?? "",

    //         dropoffLat: dropoff?.lat != null ? String(dropoff.lat) : "",
    //         dropoffLon: dropoff?.lon != null ? String(dropoff.lon) : "",
    //         dropoffAddress: dropoff?.address ?? "",

    //         type: type ?? "",
    //         rideType: rideType ?? "standard",
    //     };
    // }

    async initRide(rideId: string, input: RideRequestInput) {
        const k = this.keys(rideId);
        // await redis.hSet(k.ride, this.buildInitialState(input));
        await redis.expire(k.ride, RideConfig.RIDE_TTL_SECONDS);
        await redis.del(k.cancel);
    }

    async tryAcquireSearchLock(rideId: string): Promise<boolean> {
        const k = this.keys(rideId);
        const result = await redis.set(k.lock, "1", {
            NX: true,
            EX: RideConfig.SEARCH_LOCK_EX_SECONDS,
        });
        return result === "OK";
    }

    async keepAliveSearchLock(rideId: string, seconds = 60) {
        const k = this.keys(rideId);
        await redis.expire(k.lock, seconds);
    }

    async isCancelled(rideId: string) {
        const k = this.keys(rideId);
        return (await redis.exists(k.cancel)) === 1;
    }

    async getAcceptedDriverId(rideId: string) {
        const k = this.keys(rideId);
        return await redis.get(k.accept);
    }

    async getRideData(rideId: string) {
        const k = this.keys(rideId);
        return await redis.hGetAll(k.ride);
    }

    async setPhase(rideId: string, phase: string) {
        const k = this.keys(rideId);
        await redis.hSet(k.ride, { phase });
    }

    async markExpired(rideId: string) {
        const k = this.keys(rideId);
        await redis.hSet(k.ride, { phase: "expired" });
        await redis.set(k.cancel, "1", { EX: 60 }); // your existing behavior
    }
}
