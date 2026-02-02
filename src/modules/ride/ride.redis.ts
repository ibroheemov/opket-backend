// src/modules/ride/ride.redis.ts
import { ACCEPT_RIDE_LUA, RESERVE_RIDE_LUA } from "./ride.lua";
import { RideKeys } from "./ride.keys";
import { redis } from "../../redis/redisClient";

/**
 * NOTE: adjust these imports to your codebase.
 */

export async function reserveRideForDriver(params: {
    rideId: string;
    driverId: string;
    ttlMs: number;
}) {
    const { rideId, driverId, ttlMs } = params;

    const reservationKey = RideKeys.reservation(rideId, driverId);
    const driverOfferKey = RideKeys.driverOffer(driverId);

    const reserved = await redis.eval(RESERVE_RIDE_LUA, {
        keys: [reservationKey, driverOfferKey],
        arguments: [driverId, rideId, ttlMs.toString()],
    });

    return reserved === 1;
}

export async function acceptRideLua(params: {
    rideId: string;
    driverId: string;
    nowMs: number;
}) {
    const { rideId, driverId, nowMs } = params;

    const rideKey = RideKeys.ride(rideId);
    const acceptKey = RideKeys.accept(rideId);
    const reservationKey = RideKeys.reservation(rideId, driverId);

    const result = await redis.eval(ACCEPT_RIDE_LUA, {
        keys: [rideKey, acceptKey, reservationKey],
        arguments: [driverId, nowMs.toString()],
    });

    const [accepted, reasonOrWinner] = result as [number, string];
    return { accepted, reasonOrWinner };
}

export async function rideAcceptedDriverId(rideId: string) {
    return redis.get(RideKeys.accept(rideId));
}

export async function rideCancelled(rideId: string) {
    return (await redis.exists(RideKeys.cancel(rideId))) === 1;
}

export async function refreshSearchLock(rideId: string, exSeconds: number) {
    // keep lock alive
    await redis.expire(RideKeys.searchLock(rideId), exSeconds);
}

export async function cleanupOfferKeys(params: {
    rideId: string;
    driverId: string;
}) {
    const { rideId, driverId } = params;
    await Promise.all([
        redis.del(RideKeys.reservation(rideId, driverId)),
        redis.del(RideKeys.driverOffer(driverId)),
    ]);
}

export async function cleanupWinnerReservationKeys(params: {
    rideId: string;
    driverId: string;
}) {
    // same as cleanupOfferKeys, but separate name so service can be explicit
    return cleanupOfferKeys(params);
}

export async function addOfferedDriver(params: {
    rideId: string;
    driverId: string;
    offeredSetTtlSeconds: number;
}) {
    const { rideId, driverId, offeredSetTtlSeconds } = params;

    const offeredSetKey = RideKeys.offeredSet(rideId);
    await redis
        .multi()
        .sAdd(offeredSetKey, driverId)
        .expire(offeredSetKey, offeredSetTtlSeconds)
        .exec();
}

export async function getOfferedDrivers(rideId: string) {
    return redis.sMembers(RideKeys.offeredSet(rideId));
}

export async function deleteOfferedSet(rideId: string) {
    return redis.del(RideKeys.offeredSet(rideId));
}

export async function getRideHash(rideId: string) {
    return redis.hGetAll(RideKeys.ride(rideId));
}

export async function setRidePhase(rideId: string, phase: string) {
    return redis.hSet(RideKeys.ride(rideId), { phase });
}

export async function markRideExpired(params: { rideId: string; cancelTtlSec: number }) {
    const { rideId, cancelTtlSec } = params;
    await setRidePhase(rideId, "expired");
    await redis.set(RideKeys.cancel(rideId), "1", { EX: cancelTtlSec });
}

export async function publishRideAccepted(params: { rideId: string; driverId: string }) {
    const { rideId, driverId } = params;
    await redis.publish("ride.accepted", JSON.stringify({ rideId, driverId }));
}
