import { Types } from "mongoose";
import { RideCompletedPayload } from "../bot/socket/types";
import { sleep } from "../bot/utils/helpers";
import { emitToDriver, emitToUser } from "../gateway/ride.socket";
import { DriverModel } from "../models/DriverModel";
import { RideModel } from "../models/Ride";
import { RideConfig } from "../modules/ride/ride.config";
import { RideKeys } from "../modules/ride/ride.keys";
import { ACCEPT_RIDE_LUA, RESERVE_RIDE_LUA } from "../modules/ride/ride.lua";
import { DriverCandidate, GhostRideInput, RideRequestInput, RideSearchMode } from "../modules/ride/ride.types";
import { redis } from "../redis/redisClient";
import { DriverRepository } from "../repositories/driver.repository";
import { RideRepository } from "../repositories/ride.repository";
import { driverStoreRedis } from "../store/driverStoreRedis";
import { calculateApproxTime } from "../utils/calculateApproxTime";
import { handleRideCommission } from "../utils/fare.helper";
import { sendFcm } from "../utils/sendFcm";

const rideSearchControllers = new Map<string, AbortController>();
const attemptsByRide = new Map<string, Map<string, { lastTs: number; count: number }>>();

const MAX_SEARCH_TIME_MS = 3 * 60 * 1000;
const INITIAL_RADIUS_KM = 0.5;
const RADIUS_STEP_KM = 0.5;
const PARALLEL_MAX_DRIVERS = 3;
const PARALLEL_RADIUS_EXPAND_MS = 15000;
const OFFERED_SET_EX_SECONDS = 300;
const OFFER_TTL_MS = 8000;        // wait 7s
const RADIUS_2KM = 2.0;
const POLL_MS = 400;              // when no drivers or between loops
const REOFFER_AFTER_MS = 10_000;  // 
const SEQ_OFFER_COUNT = 2;
const SEQ_OFFER_TTL_MS = 8000;      // 8 seconds each driver
const BROADCAST_RADIUS_KM = 1.35;
const BROADCAST_WAIT_MS = 15000;    // 15 seconds
const LOOP_GAP_MS = 250;            // small pause between phases
const STAGE1_PARALLEL_DRIVERS = 5;
const STAGE1_TTL_MS = 8000;
const MAX_OFFERS_PER_DRIVER = 2;

export const RideService = {

    getAttempts(rideId: string) {
        if (!attemptsByRide.has(rideId)) attemptsByRide.set(rideId, new Map());
        return attemptsByRide.get(rideId)!;
    },

    async requestRide(input: RideRequestInput) {
        const { phone, chatId, location, dropoff, address, type, rideType, options } = input;
        if (!phone && !chatId) return;

        const ride = await RideRepository.createRide(input);
        const rideId = ride._id.toString();

        const now = Date.now();

        await redis.hSet(RideKeys.ride(ride.id), {
            phase: "pending",
            createdAt: now.toString(),
            expiresAt: (now + RideConfig.RIDE_TTL_SECONDS * 1000).toString(),

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

        await redis.expire(RideKeys.ride(ride.id), RideConfig.RIDE_TTL_SECONDS);
        await redis.del(RideKeys.cancel(ride.id));

        const lockAcquired = await redis.set(
            RideKeys.searchLock(ride.id),
            "1",
            { NX: true, EX: RideConfig.SEARCH_LOCK_EX_SECONDS }
        );

        if (!lockAcquired) {
            console.log(`⚠️ Search already running for ride ${rideId}`);
            return { ride_id: rideId };
        }

        const controller = new AbortController();
        rideSearchControllers.set(rideId, controller);

        this.searchForDriversSequential(rideId, location, phone, controller.signal, options).catch((err) => {
            if (err?.message === "Aborted") return;
            console.error("Search failed:", err);
        });

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
        const attempts = this.getAttempts(rideId);

        const MAX_ATTEMPT_ENTRIES = 10_000;
        if (attempts.size > MAX_ATTEMPT_ENTRIES) attempts.clear();

        console.log(`🚀 Cycle search started for ride ${rideId}`);

        const checkStop = async () => {
            // ✅ CHANGE #1: Abort should NOT look like a normal "stop" (otherwise you fall through to "expired")
            if (signal?.aborted) throw new Error("Aborted");

            // keep distributed lock alive
            await redis.expire(RideKeys.searchLock(rideId), 60);

            if (await redis.exists(cancelKey)) return true;
            if (await redis.get(acceptKey)) return true;

            if (Date.now() - startTime >= MAX_SEARCH_TIME_MS) return true;
            return false;
        };

        const fetchCandidatesInRadius = async (radiusKm: number) => {
            const drivers = await DriverRepository.findAvailableDrivers(
                pickup.lat,
                pickup.lon,
                radiusKm,
                options ?? []
            );
            return drivers.sort((a, b) => a.distKm - b.distKm);
        };

        const canAttempt = (driverId: string, now = Date.now()) => {
            const a = attempts.get(driverId);
            if (!a) return true; // never offered

            // hard cap
            if (a.count >= MAX_OFFERS_PER_DRIVER) return false;

            // cooldown before the 2nd offer
            return (now - a.lastTs) >= REOFFER_AFTER_MS;
        };

        // ✅ Call this ONLY after we successfully reserved+emitted
        const markAttempt = (driverId: string, now = Date.now()) => {
            const prev = attempts.get(driverId);
            attempts.set(driverId, {
                count: (prev?.count ?? 0) + 1,
                lastTs: now,
            });
        };

        const reserveAndEmit = async (
            candidate: DriverCandidate,
            rideData: Record<string, string>,
            ttlMs: number,
            isSingleOfferUi: boolean
        ) => {
            const driverId = candidate.driver.driverId;

            const reservationKey = `ride_reservation:${rideId}:${driverId}`;
            const driverOfferKey = `driver_offer:${driverId}`;
            const offeredSetKey = `ride_offered:${rideId}`;

            const reserved = await redis.eval(RESERVE_RIDE_LUA, {
                keys: [reservationKey, driverOfferKey],
                arguments: [driverId, rideId, ttlMs.toString()],
            });

            if (reserved !== 1) return { ok: false as const, driverId };

            const payload = RideService.buildDriverOfferPayload(
                rideId,
                rideData,
                candidate,
                isSingleOfferUi
            );

            await Promise.all([
                emitToDriver(driverId, "ride_offer", payload),
                emitToDriver(`${driverId}-bg`, "ride_offer", payload),
            ]);

            await redis
                .multi()
                .sAdd(offeredSetKey, driverId)
                .expire(offeredSetKey, OFFERED_SET_EX_SECONDS)
                .exec();

            const driverObjectId = new Types.ObjectId(driverId);
            RideRepository.setRideStatus(rideId, "offered", { by: "system", driverId: driverObjectId, distKm: candidate.distKm });

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

        const pickNextEligible = (drivers: DriverCandidate[], lastId: string | null) => {
            const eligible = drivers.filter(d => canAttempt(d.driver.driverId));
            if (!eligible.length) return null;
            if (!lastId) return eligible[0];

            const idx = eligible.findIndex(d => d.driver.driverId === lastId);
            if (idx === -1) return eligible[0];
            return eligible[(idx + 1) % eligible.length];
        };

        // ✅ CHANGE #2: Wrap the whole loop so "Aborted" exits quietly (no "expired")
        try {
            // =========================
            // MAIN CYCLE LOOP
            // =========================
            while (!(await checkStop())) {
                // 1) Offer 2 drivers sequentially (8s each)
                // 1) Stage 1: Offer to top 5 drivers in parallel for 8s
                {
                    if (await checkStop()) return;

                    const candidates = await fetchCandidatesInRadius(BROADCAST_RADIUS_KM);
                    if (!candidates.length) {
                        await sleep(POLL_MS);
                        continue;
                    }

                    // Only eligible drivers (cooldown + max attempts)
                    const eligible = candidates
                        .filter(d => canAttempt(d.driver.driverId))
                        .slice(0, STAGE1_PARALLEL_DRIVERS);

                    if (!eligible.length) {
                        await sleep(POLL_MS);
                        continue;
                    }

                    const rideData = await redis.hGetAll(rideKey);

                    // Reserve first (so we don’t spam drivers who are already reserved elsewhere)
                    const reservedDriverIds: string[] = [];
                    const reservedCandidates: DriverCandidate[] = [];

                    for (const cand of eligible) {
                        const driverId = cand.driver.driverId;

                        // mark attempt early to avoid hammering same drivers in tight loops

                        const { ok } = await reserveAndEmit(
                            cand,
                            rideData,
                            STAGE1_TTL_MS,
                            false // parallel UI (unless you want single-offer UI)
                        );

                        if (ok) {
                            markAttempt(driverId);
                            reservedDriverIds.push(driverId);
                            reservedCandidates.push(cand);
                        }
                    }

                    if (!reservedDriverIds.length) {
                        await sleep(POLL_MS);
                        continue;
                    }

                    // Wait for FIRST acceptance among them
                    const acceptedStage1 = await this.waitForAcceptanceWithFallback(
                        rideId,
                        "*",
                        STAGE1_TTL_MS,
                        signal
                    );

                    if (acceptedStage1) {
                        console.log(`✅ Ride ${rideId} accepted in stage 1 by ${acceptedStage1}`);
                        return;
                    }

                    // Nobody accepted within TTL -> cleanup stage 1 reservations
                    if (!(await redis.get(acceptKey))) {
                        await Promise.all(reservedDriverIds.map(id => cleanupOffer(id)));
                    }

                    await sleep(LOOP_GAP_MS);
                }

                if (await checkStop()) return;

                await sleep(LOOP_GAP_MS);

                // 2) Broadcast to ALL drivers within 2km, wait 15s
                const broadcastCandidates = await fetchCandidatesInRadius(BROADCAST_RADIUS_KM);

                if (!broadcastCandidates.length) {
                    await sleep(POLL_MS);
                    continue;
                }

                // Only those we are allowed to attempt (your policy: max 2 offers per driver total)
                const broadcastEligible = broadcastCandidates.filter(d => canAttempt(d.driver.driverId));

                if (!broadcastEligible.length) {
                    // everyone is in cooldown / maxed -> wait a bit and repeat cycle
                    await sleep(POLL_MS);
                    continue;
                }

                const rideData = await redis.hGetAll(rideKey);

                // Reserve+emit for everyone we can reserve
                const reservedDriverIds: string[] = [];
                const reservedCandidates: DriverCandidate[] = [];

                await Promise.all(
                    broadcastEligible.map(async (cand) => {
                        const driverId = cand.driver.driverId;

                        // mark attempt BEFORE reserve to avoid hammering same driver in rapid cycles

                        const { ok } = await reserveAndEmit(cand, rideData, BROADCAST_WAIT_MS, false);
                        if (ok) {
                            markAttempt(driverId);
                            reservedDriverIds.push(driverId);
                            reservedCandidates.push(cand);
                        }
                    })
                );

                if (!reservedDriverIds.length) {
                    await sleep(POLL_MS);
                    continue;
                }

                const acceptedBroadcast = await this.waitForAcceptanceWithFallback(
                    rideId,
                    "*",
                    BROADCAST_WAIT_MS,
                    signal
                );

                if (acceptedBroadcast) {
                    console.log(`✅ Ride ${rideId} accepted by ${acceptedBroadcast}`);
                    return;
                }

                // Broadcast timed out -> cleanup all
                if (!(await redis.get(acceptKey))) {
                    await Promise.all(reservedDriverIds.map(id => cleanupOffer(id)));
                }

                await sleep(LOOP_GAP_MS);
                // loop repeats
            }

            // stop reasons
            if (await redis.get(acceptKey)) return;
            if (await redis.exists(cancelKey)) return;

            console.log(`⏳ Ride ${rideId} expired — no acceptance`);
            await redis.hSet(rideKey, { phase: "expired" });

            const rideData = await redis.hGetAll(rideKey);
            if (rideData.userPhoneNumber) {
                emitToUser(Number(rideData.userPhoneNumber), "ride_no_drivers", null);
            }
            // 🧹 cleanup per-ride attempt tracking
            attemptsByRide.delete(rideId);
        } catch (err: any) {
            if (err?.message === "Aborted") return; // ✅ abort/restart => do not expire
            throw err;
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
            const isSingleOffer = reservedDrivers.length === 1;

            await Promise.all(
                reservedDrivers.map(candidate => {
                    const driverId = candidate.driver.driverId;
                    const payload = RideService.buildDriverOfferPayload(
                        rideId,
                        rideData,
                        candidate,
                        isSingleOffer
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
                    OFFER_TTL_MS,
                    signal
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


    async restartSearching(rideId: string, pickup: { lat: number; lon: number }, phone?: number, options?: string[]) {
        // Stop any in-memory loop (if running)
        this.stopSearching(rideId);

        // Release distributed lock so requestRide-style flow can start again
        await redis.del(RideKeys.searchLock(rideId));

        // Remove cancel key if you use it to stop searches
        await redis.del(RideKeys.cancel(rideId));

        // Start again
        const controller = new AbortController();
        rideSearchControllers.set(rideId, controller);

        this.searchForDriversSequential(rideId, pickup, phone, controller.signal, options)
            .catch(err => {
                if (err?.message === "Aborted") return;
                console.error("Restart search failed:", err);
            });
    },

    async waitForAcceptanceWithFallback(
        rideId: string,
        driverId: string,
        timeoutMs: number,
        signal?: AbortSignal // ✅ CHANGE #1: add optional AbortSignal
    ): Promise<string | null> {
        const acceptKey = `ride_accept:${rideId}`;

        // 1️⃣ Fast check: maybe driver already accepted
        const acceptedDriverId = await redis.get(acceptKey);
        if (acceptedDriverId) return acceptedDriverId;

        // 2️⃣ Subscribe to acceptance event
        return new Promise(async (resolve, reject) => {
            const subscriber = redis.duplicate();
            await subscriber.connect();

            let done = false;
            const finish = async (val: string | null) => {
                if (done) return;
                done = true;

                try {
                    await subscriber.unsubscribe("ride.accepted");
                } catch { }

                try {
                    await subscriber.disconnect();
                } catch { }

                resolve(val);
            };

            const timeout = setTimeout(async () => {
                await finish(null);
            }, timeoutMs);

            // ✅ CHANGE #2: abort should stop waiting immediately
            const onAbort = () => {
                clearTimeout(timeout);
                void finish(null);
            };

            if (signal) {
                if (signal.aborted) {
                    onAbort();
                    return;
                }
                signal.addEventListener("abort", onAbort, { once: true });
            }

            await subscriber.subscribe("ride.accepted", async (message) => {
                try {
                    const data = JSON.parse(message);
                    if (data.rideId === rideId) {
                        clearTimeout(timeout);
                        await finish(data.driverId);
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
        candidate: { distKm: number },
        isSingleOffer: boolean
    ) {
        const travelTimeMin = calculateApproxTime(candidate.distKm);

        return {
            type: 'ride_request',
            channelKey: isSingleOffer ? "ride_channel_v7" : "ride_channel_parallel_v7",
            title: isSingleOffer ? "Sizga yangi buyurtma bor" : "O'rtadagi buyurtma",
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
        const rideActiveTtlMs = RideConfig.RIDE_ACTIVE_TTL_SECONDS * 1000;

        // 1) Lua
        const result = await redis.eval(ACCEPT_RIDE_LUA, {
            keys: [rideKey, acceptKey, reservationKey],
            arguments: [driverId, now.toString(), rideActiveTtlMs.toString()],
        });

        const [accepted, reasonOrWinner] = result as [number, string];
        if (accepted === 0) return { success: false, reason: reasonOrWinner };

        // ✅ update Mongo driverId without awaiting
        void RideModel.findByIdAndUpdate(
            rideId,
            { driverId, status: "accepted", acceptedAt: new Date() },
        ).exec().catch(err => console.error("Mongo ride update failed:", err));

        RideRepository.setRideStatus(rideId, "accepted", { by: "driver" });

        // 2) Stop searching (non-Redis; keep as you prefer)
        this.stopSearching(rideId);
        attemptsByRide.delete(rideId);

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

    async completeRideGhostRide(data: GhostRideInput) {
        const { driverId, fare, distanceTraveled } = data;

        await RideRepository.createGostRide(data);

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
        const { rideId, distance, fare, pauseSeconds } = data;
        const rideKey = `ride:${rideId}`;
        const acceptKey = `ride_accept:${rideId}`;
        const driverKey = `driver:${driverId}`;

        // 1️⃣ Verify ride exists and driver actually accepted it
        const rideData = await redis.hGetAll(rideKey);
        console.log(rideData, driverId);

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
                pauseSeconds,
                fare,
                status: "completed",
            }
        );

        RideRepository.setRideStatus(rideId, "completed", { by: "driver" })

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