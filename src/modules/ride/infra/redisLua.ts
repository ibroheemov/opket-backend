// import { redis } from "../../../redis/redisClient";
// import { rideKeys } from "./redisKeys";

// export async function reserveRideForDriver(params: {
//     rideId: string;
//     driverId: string;
//     ttlMs: number;
// }): Promise<boolean> {
//     const { rideId, driverId, ttlMs } = params;
//     const ok = await redis.eval(RESERVE_RIDE_LUA, {
//         keys: [
//             rideKeys.reservation(rideId, driverId),
//             rideKeys.driverOffer(driverId),
//         ],
//         arguments: [driverId, rideId, String(ttlMs)],
//     });
//     return ok === 1;
// }

// export type AcceptRideResult =
//     | { ok: true; winnerDriverId: string }
//     | { ok: false; reason: string };

// export async function acceptRideAtomically(params: {
//     rideId: string;
//     driverId: string;
//     nowMs: number;
// }): Promise<AcceptRideResult> {
//     const { rideId, driverId, nowMs } = params;
//     const res = await redis.eval(ACCEPT_RIDE_LUA, {
//         keys: [
//             rideKeys.ride(rideId),
//             rideKeys.accept(rideId),
//             rideKeys.reservation(rideId, driverId),
//         ],
//         arguments: [driverId, String(nowMs)],
//     });

//     const [accepted, reasonOrWinner] = res as [number, string];
//     return accepted === 1
//         ? { ok: true, winnerDriverId: reasonOrWinner }
//         : { ok: false, reason: reasonOrWinner };
// }
