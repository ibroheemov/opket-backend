// // src/modules/ride/ride.search.ts
// import { RideConfig } from "./ride.config";
// import { RideKeys } from "./ride.keys";
// import type {
//     DriverCandidate,
//     NotifyOfferedDriversParams,
//     RideDriverOfferPayload,
// } from "./ride.types";
// import {
//     addOfferedDriver,
//     cleanupOfferKeys,
//     getOfferedDrivers,
//     deleteOfferedSet,
//     getRideHash,
//     markRideExpired,
//     refreshSearchLock,
//     rideAcceptedDriverId,
//     rideCancelled,
//     reserveRideForDriver,
// } from "./ride.redis";
// import { redis } from "../../redis/redisClient";
// import { emitToDriver, emitToUser } from "../../gateway/ride.socket";
// import { DriverRepository } from "../../repositories/driver.repository";
// import { sleep } from "../../bot/utils/helpers";
// import { calculateApproxTime } from "../../utils/calculateApproxTime";

// /**
//  * NOTE: adjust these imports to your codebase.
//  */


// export function nextDriver(
//     drivers: DriverCandidate[],
//     lastDriverId: string | null
// ): DriverCandidate | null {
//     if (!drivers.length) return null;
//     if (!lastDriverId) return drivers[0];

//     const idx = drivers.findIndex((d) => d.driverId === lastDriverId);
//     if (idx === -1) return drivers[0];

//     return drivers[(idx + 1) % drivers.length];
// }

// export function buildDriverOfferPayload(
//     rideId: string,
//     rideData: Record<string, string>,
//     candidate: { distKm: number }
// ): RideDriverOfferPayload {
//     const travelTimeMin = calculateApproxTime(candidate.distKm);

//     return {
//         type: "ride_request",
//         ride_id: rideId,
//         phone: rideData.userPhoneNumber ?? "",
//         chatId: rideData.userChatId ?? "",
//         pickup: JSON.stringify({
//             lat: Number(rideData.pickupLat),
//             lon: Number(rideData.pickupLon),
//             address: rideData.pickupAddress ?? "",
//         }),
//         travelDistance: candidate.distKm.toFixed(2),
//         travelTime: travelTimeMin.toString(),
//         rideType: rideData.rideType ?? "standard",
//     };
// }

// export async function waitForAcceptanceWithFallback(
//     rideId: string,
//     _driverId: string, // kept for signature compatibility; unused with pub/sub approach
//     timeoutMs: number
// ): Promise<string | null> {
//     const acceptKey = RideKeys.accept(rideId);

//     // Fast check
//     const alreadyAccepted = await redis.get(acceptKey);
//     if (alreadyAccepted) return alreadyAccepted;

//     // Subscribe
//     return new Promise(async (resolve) => {
//         const subscriber = redis.duplicate();
//         await subscriber.connect();

//         const timeout = setTimeout(async () => {
//             await subscriber.disconnect();
//             resolve(null);
//         }, timeoutMs);

//         await subscriber.subscribe("ride.accepted", async (message) => {
//             try {
//                 const data = JSON.parse(message);
//                 if (data.rideId === rideId) {
//                     clearTimeout(timeout);
//                     await subscriber.unsubscribe("ride.accepted");
//                     await subscriber.disconnect();
//                     resolve(data.driverId);
//                 }
//             } catch (err) {
//                 console.error("Failed parsing ride.accepted message", err);
//             }
//         });
//     });
// }

// export async function notifyOfferedDriversSearchStopped(params: NotifyOfferedDriversParams) {
//     const {
//         rideId,
//         reason,
//         winnerDriverId,
//         cleanupKeys = true,
//         deleteOfferedSet: shouldDeleteSet = true,
//     } = params;

//     const offeredDriverIds = await getOfferedDrivers(rideId);
//     if (!offeredDriverIds?.length) return;

//     const notifyIds = winnerDriverId
//         ? offeredDriverIds.filter((id) => id && id !== winnerDriverId)
//         : offeredDriverIds.filter((id) => id);

//     await Promise.all(
//         notifyIds.map(async (id) => {
//             if (cleanupKeys) {
//                 await Promise.all([
//                     redis.del(RideKeys.reservation(rideId, id)),
//                     redis.del(RideKeys.driverOffer(id)),
//                 ]);
//             }

//             const payload = {
//                 rideId,
//                 reason,
//                 ...(winnerDriverId ? { winnerDriverId } : {}),
//             };

//             await Promise.all([
//                 emitToDriver(id, "ride_search_stopped", payload),
//                 emitToDriver(`${id}-bg`, "ride_search_stopped", payload),
//             ]);
//         })
//     );

//     if (shouldDeleteSet) {
//         await deleteOfferedSet(rideId);
//     }
// }

// export async function searchForDriversSequential(params: {
//     rideId: string;
//     pickup: { lat: number; lon: number };
//     phone?: number;
//     signal?: AbortSignal;
//     options?: string[];
// }) {
//     const { rideId, pickup, phone, signal, options } = params;

//     const startTime = Date.now();
//     const attemptedDriverIds = new Set<string>();

//     console.log(`🚀 Starting 4-stage sequential escalation for ride ${rideId}`);

//     const isExpired = () => Date.now() - startTime >= RideConfig.MAX_SEARCH_TIME_MS;

//     const checkStopConditions = async () => {
//         if (signal?.aborted) return true;

//         await refreshSearchLock(rideId, RideConfig.SEARCH_LOCK_REFRESH_SECONDS);

//         if (await rideCancelled(rideId)) {
//             console.log(`🛑 Ride ${rideId} cancelled`);
//             return true;
//         }

//         const accepted = await rideAcceptedDriverId(rideId);
//         if (accepted) return true;

//         if (isExpired()) return true;

//         return false;
//     };

//     const fetchCandidates = async (radius: number) => {
//         const drivers = await DriverRepository.findAvailableDrivers(
//             pickup.lat,
//             pickup.lon,
//             radius,
//             options ?? []
//         );

//         return drivers.sort((a: DriverCandidate, b: DriverCandidate) => a.distKm - b.distKm);
//     };

//     const reserveAndEmit = async (candidate: DriverCandidate, rideData: Record<string, string>, ttlMs: number) => {
//         const driverId = candidate.driver.driverId;

//         const reserved = await reserveRideForDriver({ rideId, driverId, ttlMs });
//         if (!reserved) return { ok: false as const, driverId };

//         const payload = buildDriverOfferPayload(rideId, rideData, candidate);

//         await Promise.all([
//             emitToDriver(driverId, "ride_offer", payload),
//             emitToDriver(`${driverId}-bg`, "ride_offer", payload),
//         ]);

//         await addOfferedDriver({
//             rideId,
//             driverId,
//             offeredSetTtlSeconds: RideConfig.OFFERED_SET_TTL_SECONDS,
//         });

//         console.log(`🔐 Offered ride ${rideId} to driver ${driverId} (ttl=${ttlMs}ms)`);
//         return { ok: true as const, driverId };
//     };

//     const cleanupOffer = async (driverId: string) => {
//         await Promise.all([
//             cleanupOfferKeys({ rideId, driverId }),
//             emitToDriver(driverId, "ride_already_taken", { rideId }),
//             emitToDriver(`${driverId}-bg`, "ride_already_taken", { rideId }),
//         ]);
//     };

//     const offerOneAndWait = async (radius: number): Promise<string | null> => {
//         const rideData = await getRideHash(rideId);

//         const candidates = await fetchCandidates(radius);
//         const next = candidates.find((c) => !attemptedDriverIds.has(c.driver.driverId));
//         if (!next) return null;

//         const driverId = next.driver.driverId;
//         attemptedDriverIds.add(driverId);

//         const { ok } = await reserveAndEmit(next, rideData, RideConfig.OFFER_TTL_MS);
//         if (!ok) return null;

//         const acceptedDriverId = await waitForAcceptanceWithFallback(
//             rideId,
//             driverId,
//             RideConfig.STAGE1_2_WAIT_MS
//         );

//         if (acceptedDriverId) return acceptedDriverId;

//         // If nobody accepted globally, cleanup
//         if (!(await rideAcceptedDriverId(rideId))) {
//             await cleanupOffer(driverId);
//         }

//         return null;
//     };

//     const offerAllAndWaitUntilTimeout = async (radius: number): Promise<string | null> => {
//         const rideData = await getRideHash(rideId);

//         const candidates = (await fetchCandidates(radius)).filter(
//             (c) => !attemptedDriverIds.has(c.driver.driverId)
//         );

//         if (!candidates.length) return null;

//         candidates.forEach((c) => attemptedDriverIds.add(c.driver.driverId));

//         const remainingMs = Math.max(0, RideConfig.MAX_SEARCH_TIME_MS - (Date.now() - startTime));
//         const ttlMs = Math.min(Math.max(remainingMs, 3000), RideConfig.MAX_SEARCH_TIME_MS);

//         const results = await Promise.all(candidates.map((c) => reserveAndEmit(c, rideData, ttlMs)));
//         const offeredIds = results.filter((r) => r.ok).map((r) => r.driverId);

//         if (!offeredIds.length) return null;

//         const acceptedDriverId = await waitForAcceptanceWithFallback(rideId, "*", remainingMs);
//         if (acceptedDriverId) return acceptedDriverId;

//         if (!(await rideAcceptedDriverId(rideId))) {
//             await Promise.all(offeredIds.map(cleanupOffer));
//         }

//         return null;
//     };

//     // Stage 1
//     if (!(await checkStopConditions())) {
//         const accepted = await offerOneAndWait(RideConfig.STAGE1_2_RADIUS_KM);
//         if (accepted) return;
//     }

//     // Stage 2
//     if (!(await checkStopConditions())) {
//         const accepted = await offerOneAndWait(RideConfig.STAGE1_2_RADIUS_KM);
//         if (accepted) return;
//     }

//     // Stage 3
//     if (!(await checkStopConditions())) {
//         const accepted = await offerAllAndWaitUntilTimeout(RideConfig.STAGE3_RADIUS_KM);
//         if (accepted) return;
//     }

//     // Final
//     if (await rideAcceptedDriverId(rideId)) {
//         console.log(`✅ Ride ${rideId} accepted (detected via acceptKey)`);
//         return;
//     }

//     if (await rideCancelled(rideId)) return;

//     console.log(`⏳ Ride ${rideId} expired — no drivers`);
//     await markRideExpired({ rideId, cancelTtlSec: 60 });

//     const rideData = await getRideHash(rideId);
//     if (rideData.userPhoneNumber) {
//         emitToUser(Number(rideData.userPhoneNumber), "ride_no_drivers", null);
//     }
// }

// export async function searchForDriversParallel(params: {
//     rideId: string;
//     pickup: { lat: number; lon: number };
//     phone?: number;
//     signal?: AbortSignal;
//     options?: string[];
// }) {
//     const { rideId, pickup, signal, options } = params;

//     const startTime = Date.now();
//     let radiusKm = RideConfig.INITIAL_RADIUS_KM;
//     let lastRadiusExpand = Date.now();

//     console.log(`🚀 Parallel search started for ride ${rideId}`);

//     while (Date.now() - startTime < RideConfig.MAX_SEARCH_TIME_MS) {
//         if (signal?.aborted) return;
//         if (await rideCancelled(rideId)) return;

//         if (Date.now() - lastRadiusExpand >= RideConfig.PARALLEL_RADIUS_EXPAND_MS) {
//             radiusKm += RideConfig.RADIUS_STEP_KM;
//             lastRadiusExpand = Date.now();
//             console.log(`📡 Expanding radius to ${radiusKm}km`);
//         }

//         const drivers = await DriverRepository.findAvailableDrivers(
//             pickup.lat,
//             pickup.lon,
//             radiusKm,
//             options ?? []
//         );

//         if (!drivers.length) {
//             await sleep(500);
//             continue;
//         }

//         const selected = drivers
//             .sort((a: DriverCandidate, b: DriverCandidate) => a.distKm - b.distKm)
//             .slice(0, RideConfig.PARALLEL_MAX_DRIVERS);

//         const reservedDrivers: DriverCandidate[] = [];
//         for (const candidate of selected) {
//             const driverId = candidate.driver.driverId;
//             const ok = await reserveRideForDriver({ rideId, driverId, ttlMs: RideConfig.OFFER_TTL_MS });
//             if (ok) reservedDrivers.push(candidate);
//         }

//         if (!reservedDrivers.length) {
//             await sleep(300);
//             continue;
//         }

//         const rideData = await getRideHash(rideId);

//         await Promise.all(
//             reservedDrivers.map(async (candidate) => {
//                 const driverId = candidate.driver.driverId;
//                 const payload = buildDriverOfferPayload(rideId, rideData, candidate);

//                 await Promise.all([
//                     emitToDriver(driverId, "ride_offer", payload),
//                     emitToDriver(`${driverId}-bg`, "ride_offer", payload),
//                 ]);

//                 await addOfferedDriver({
//                     rideId,
//                     driverId,
//                     offeredSetTtlSeconds: RideConfig.OFFERED_SET_TTL_SECONDS,
//                 });
//             })
//         );

//         const acceptedDriverId = await waitForAcceptanceWithFallback(rideId, "*", RideConfig.OFFER_TTL_MS);
//         if (acceptedDriverId) {
//             console.log(`✅ Ride accepted by ${acceptedDriverId}`);
//             return;
//         }

//         await Promise.all(
//             reservedDrivers.map(async (c) => {
//                 const driverId = c.driver.driverId;
//                 await Promise.all([
//                     redis.del(RideKeys.reservation(rideId, driverId)),
//                     emitToDriver(driverId, "ride_already_taken", { rideId }),
//                 ]);
//             })
//         );

//         await sleep(300);
//     }

//     console.log(`❌ Ride ${rideId} expired`);
//     await markRideExpired({ rideId, cancelTtlSec: 60 });
// }
