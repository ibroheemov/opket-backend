import { Types } from "mongoose";
import { RideCompletedPayload } from "../bot/socket/types";
import { sleep } from "../bot/utils/helpers";
import { emitToDriver, emitToRestaurant, emitToUser } from "../gateway/ride.socket";
import { DriverModel } from "../models/DriverModel";
import { RideModel } from "../models/Ride";
import { RestaurantModel } from "../models/Restaurant";
import { RideConfig } from "../modules/ride/ride.config";
import { RideKeys } from "../modules/ride/ride.keys";
import { ACCEPT_RIDE_LUA, RESERVE_RIDE_LUA } from "../modules/ride/ride.lua";
import { DeliveryData, DriverCandidate, GhostRideInput, RideRequestInput, RideSearchMode } from "../modules/ride/ride.types";
import { redis } from "../redis/redisClient";
import { DriverRepository } from "../repositories/driver.repository";
import { RideRepository } from "../repositories/ride.repository";
import { driverStoreRedis } from "../store/driverStoreRedis";
import { calculateApproxTime } from "../utils/calculateApproxTime";
import { handleRideCommission } from "../utils/fare.helper";
import { handlePassengerCashback } from "../utils/cashback.helper";
import { sendFcm } from "../utils/sendFcm";
import { sendToToken } from "./notifications";
import { PassengerModel } from "../models/PassengerModel";
import { FcmService } from "./fcm.service";
import { OrderModel } from "../models/OrderModel";
import { CompleteGhostRideRequestBody } from "../types/driver.types";
import { RidePhase } from "../utils/enums";
import { DirectionsService } from "./direction.service";
import { driverSessionStore } from "../store/driver.session.store";
import { RideSearchConfigService } from "./ride.search.config.service";

type StageSpec = {
    radiusKm: number;
    ttlMs: number;
    batchSize: number | null; // null = all eligible drivers
    isSingleOfferUi: boolean;
};

const rideSearchControllers = new Map<string, AbortController>();
const attemptsByRide = new Map<string, Map<string, { lastTs: number; count: number; declined: boolean; hadSingleOffer: boolean }>>();

const OFFERED_SET_EX_SECONDS = 300;
const LOOP_GAP_MS = 250;            // small pause between phases

export const RideService = {
    async requestRide(input: RideRequestInput) {
        const ride = await RideRepository.createRide(input);
        const rideId = ride.id;

        if (input.useBalance && input.phone) {
            const passenger = await PassengerModel.findOne({ phone: input.phone }).select("balance").lean();
            (input as any)._passengerBalance = passenger?.balance ?? 0;
        }

        const lockAcquired = await this.initializeRideStateAndLock(rideId, input);

        if (!lockAcquired) {
            console.warn(`⚠️ Search already running for ride ${rideId}`);
            const cfg = await RideSearchConfigService.get();
            return { ride_id: rideId, searchDurationMs: cfg.searchDurationMs };
        }

        const cfg = await RideSearchConfigService.get();
        this.startDriverSearch(rideId, input);

        return { ride_id: rideId, searchDurationMs: cfg.searchDurationMs };
    },

    async initializeRideStateAndLock(rideId: string, input: RideRequestInput) {
        const now = Date.now();
        const key = RideKeys.ride(rideId);

        const payload = this.buildRideRedisPayload(input, now, (input as any)._passengerBalance ?? 0);

        const pipeline = redis.multi();

        pipeline.hSet(key, payload);
        pipeline.expire(key, RideConfig.RIDE_TTL_SECONDS);
        pipeline.del(RideKeys.cancel(rideId));

        // lock inside same pipeline
        pipeline.set(
            RideKeys.searchLock(rideId),
            "1",
            { NX: true, EX: RideConfig.SEARCH_LOCK_EX_SECONDS }
        );

        const results = await pipeline.exec();

        const [, , , lockTuple] = results as any;
        const lockResult = lockTuple?.[1];

        return Boolean(lockResult);
    },

    async initializeRideState(rideId: string, input: RideRequestInput) {
        const now = Date.now();

        const payload = this.buildRideRedisPayload(input, now, (input as any)._passengerBalance ?? 0);

        const key = RideKeys.ride(rideId);

        await redis.hSet(key, payload);
        await redis.expire(key, RideConfig.RIDE_TTL_SECONDS);
        await redis.del(RideKeys.cancel(rideId));
    },

    buildRideRedisPayload(input: RideRequestInput, now: number, passengerBalance = 0) {
        const {
            phone,
            pickup,
            dropoff,
            address,
            rideType,
            delivery,
            isDelivery,
            useBalance,
        } = input;

        return {
            phase: RidePhase.PENDING,
            createdAt: now.toString(),
            expiresAt: (now + RideConfig.RIDE_TTL_SECONDS * 1000).toString(),
            userPhoneNumber: this.toStr(phone),

            pickupLat: this.toStr(pickup.latitude),
            pickupLon: this.toStr(pickup.longitude),
            pickupAddress: address ?? "",

            dropoffLat: this.toStr(dropoff?.latitude),
            dropoffLon: this.toStr(dropoff?.longitude),
            dropoffAddress: dropoff?.address ?? "",

            rideType: rideType ?? "standard",

            isDelivery: isDelivery ? "1" : "0",
            deliveryData: delivery ? JSON.stringify(delivery) : "",

            useBalance: useBalance ? "1" : "0",
            passengerBalance: passengerBalance.toString(),
        };
    },

    toStr(value: unknown): string {
        return value != null ? String(value) : "";
    },

    async acquireSearchLock(rideId: string): Promise<boolean> {
        return Boolean(
            await redis.set(
                RideKeys.searchLock(rideId),
                "1",
                { NX: true, EX: RideConfig.SEARCH_LOCK_EX_SECONDS }
            )
        );
    },

    startDriverSearch(rideId: string, input: RideRequestInput) {
        const controller = new AbortController();
        rideSearchControllers.set(rideId, controller);

        this.searchForDriversSequential(
            rideId,
            input.rideType,
            input.pickup,
            input.phone,
            controller.signal,
            input.options
        ).catch((err) => {
            if (err?.message === "Aborted") return;
            console.error("Search failed:", err);
        });
    },

    getAttempts(rideId: string) {
        if (!attemptsByRide.has(rideId)) attemptsByRide.set(rideId, new Map());
        return attemptsByRide.get(rideId)!;
    },

    async searchForDriversSequential(
        rideId: string,
        requestedRideType: string,
        pickup: { latitude: number; longitude: number },
        phone?: number,
        signal?: AbortSignal,
        options?: string[],
    ) {
        const cfg = await RideSearchConfigService.get();
        const MAX_SEARCH_TIME_MS = cfg.searchDurationMs;
        const REOFFER_AFTER_MS = cfg.reofferAfterMs;
        const MAX_OFFERS_PER_DRIVER = cfg.maxOffersPerDriver;

        const rideKey = `ride:${rideId}`;
        const cancelKey = `ride_cancel:${rideId}`;
        const acceptKey = `ride_accept:${rideId}`;
        const startTime = Date.now();
        const attempts = this.getAttempts(rideId);
        const TIER_PRIORITY = ["premium", "comfort", "standard"];

        let currentRideType = requestedRideType || "standard";
        let optionsNew = options ?? [];
        const startIndex = TIER_PRIORITY.indexOf(currentRideType);
        const fallbackTiers = TIER_PRIORITY.slice(startIndex);

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

        const startLiveCandidateEmitter = async () => {
            while (true) {
                if (signal?.aborted) break;

                const isCancelled = await redis.exists(cancelKey);
                const isAccepted = await redis.get(acceptKey);

                if (isCancelled || isAccepted) break;

                try {
                    const drivers = await DriverRepository.findAvailableDriversNew(
                        pickup.latitude,
                        pickup.longitude,
                        3, // or dynamic radius if you want
                        optionsNew
                    );

                    emitToUser(phone, "candidate_drivers", { drivers });

                } catch (err) {
                    console.error("Emitter error:", err);
                }

                await sleep(1000); // ⏱ every 1 second
            }

            console.log(`🛑 Stopped live candidate emitter for ride ${rideId}`);
        };

        const fetchCandidatesInRadius = async (radiusKm: number) => {
            const drivers = await DriverRepository.findAvailableDriversNew(
                pickup.latitude,
                pickup.longitude,
                radiusKm,
                optionsNew,
            );

            return drivers.sort((a, b) => a.distKm - b.distKm);
        };

        const scoreAndSort = async (candidates: DriverCandidate[]): Promise<DriverCandidate[]> => {
            if (!candidates.length) return candidates;

            const AVG_SPEED_KM_PER_MIN = 0.5; // 30 km/h
            const now = Date.now();

            const statsArr = await Promise.all(
                candidates.map(c => redis.hGetAll(`driver_stats:${c.driverId}`))
            );

            return [...candidates]
                .map((c, i) => {
                    const raw = statsArr[i] ?? {};
                    const offerCount = Number(raw.offerCount ?? 0);
                    const acceptCount = Number(raw.acceptCount ?? 0);
                    const lastOfferTs = Number(raw.lastOfferTs ?? 0);

                    const etaMin = c.distKm / AVG_SPEED_KM_PER_MIN;
                    const acceptRate = offerCount > 0 ? acceptCount / offerCount : 1.0;
                    const idleMinutes = Math.min((now - lastOfferTs) / 60_000, 10);
                    const score = etaMin * (2 - acceptRate) - idleMinutes * 0.1;

                    return { candidate: c, score };
                })
                .sort((a, b) => a.score - b.score)
                .map(x => x.candidate);
        };

        const canAttempt = (driverId: string, isSingleOfferUi: boolean, now = Date.now()) => {
            const a = attempts.get(driverId);
            if (!a) return true;
            if (a.count >= MAX_OFFERS_PER_DRIVER) return false;
            if (!isSingleOfferUi && a.hadSingleOffer) return false;
            const cooldown = a.declined ? REOFFER_AFTER_MS * 2 : REOFFER_AFTER_MS;
            return (now - a.lastTs) >= cooldown;
        };

        const markAttempt = (driverId: string, isSingleOfferUi: boolean, now = Date.now()) => {
            const prev = attempts.get(driverId);
            attempts.set(driverId, {
                count: (prev?.count ?? 0) + 1,
                lastTs: now,
                declined: prev?.declined ?? false,
                hadSingleOffer: prev?.hadSingleOffer || isSingleOfferUi,
            });
            const statsKey = `driver_stats:${driverId}`;
            redis.hIncrBy(statsKey, 'offerCount', 1).catch(() => { });
            redis.hSet(statsKey, { lastOfferTs: now.toString() }).catch(() => { });
            redis.expire(statsKey, 7 * 24 * 3600).catch(() => { });
        };

        const reserveAndEmit = async (
            candidate: DriverCandidate,
            rideData: Record<string, string>,
            ttlMs: number,
            isSingleOfferUi: boolean
        ) => {
            const driverId = candidate.driverId;
            console.log("DRIVER_ID", driverId);


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
                isSingleOfferUi,
                ttlMs,
            );

            if (!isSingleOfferUi) {
                await redis.set(
                    `driver_offer_payload:${driverId}`,
                    JSON.stringify(payload),
                    { PX: ttlMs }
                );
            }

            const [socketReached] = await Promise.all([
                emitToDriver(driverId, "ride_offer", payload),
                emitToDriver(`${driverId}-bg`, "ride_offer", payload),
            ]);

            // FCM wakeup: fires in parallel and is non-blocking.
            // Delivers the offer even when the driver's app is killed.
            // We always send it alongside the socket emit — if the socket
            // is alive the app deduplicates by notification ID (rideId.hashCode).
            DriverModel.findById(driverId).select("fcmToken").lean()
                .then(doc => {
                    if (doc?.fcmToken) {
                        return FcmService.sendRideOffer({ fcmToken: doc.fcmToken, payload, ttlMs });
                    }
                })
                .catch(err => console.error(`FCM ride_offer to driver ${driverId} failed:`, err));

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
                redis.del(`driver_offer_payload:${driverId}`),
            ]);
        };

        startLiveCandidateEmitter();

        try {
            while (Date.now() - startTime < MAX_SEARCH_TIME_MS) {

                for (const tier of fallbackTiers) {

                    if (await checkStop()) return;

                    // 🔄 change ride type if tier changed
                    if (tier !== currentRideType) {
                        console.log(`🔄 Fallback rideType: ${currentRideType} → ${tier}`);

                        optionsNew = optionsNew.map(t =>
                            t === currentRideType ? tier : t
                        );

                        currentRideType = tier;

                        await redis.hSet(rideKey, { rideType: tier });
                    }

                    const runStage = this.createStageRunner({
                        rideId,
                        rideKey,
                        acceptKey,
                        signal,
                        checkStop,
                        fetchCandidatesInRadius: (radiusKm: number) =>
                            fetchCandidatesInRadius(radiusKm),
                        scoreAndSort,
                        canAttempt,
                        markAttempt,
                        reserveAndEmit,
                        cleanupOffer,
                    });

                    // Stage 0: batch, small radius, full-screen offer
                    if ((await runStage({ radiusKm: cfg.stage1RadiusKm, ttlMs: cfg.stage1TtlMs, batchSize: cfg.stage1BatchSize, isSingleOfferUi: true })).acceptedDriverId) return;

                    await sleep(LOOP_GAP_MS);

                    // Stage 1: batch, wider radius, full-screen offer
                    if ((await runStage({ radiusKm: cfg.stage2RadiusKm, ttlMs: cfg.stage2TtlMs, batchSize: cfg.stage2BatchSize, isSingleOfferUi: true })).acceptedDriverId) return;

                    await sleep(LOOP_GAP_MS);

                    // Stage 2: all eligible, list widget
                    if ((await runStage({ radiusKm: cfg.stage3RadiusKm, ttlMs: cfg.stage3TtlMs, batchSize: null, isSingleOfferUi: false })).acceptedDriverId) return;

                    await sleep(LOOP_GAP_MS);

                    // Stage 3: all eligible, list widget (tier fallback starts here)
                    if ((await runStage({ radiusKm: cfg.stage4RadiusKm, ttlMs: cfg.stage4TtlMs, batchSize: null, isSingleOfferUi: false })).acceptedDriverId) return;

                    await sleep(LOOP_GAP_MS);
                }

                // small pause before restarting tier cycle
                await sleep(500);
            }

            console.log(`⏳ Ride ${rideId} expired — no acceptance`);

            await redis.hSet(rideKey, { phase: "expired" });

            const rideData = await redis.hGetAll(rideKey);

            if (rideData.userPhoneNumber) {
                emitToUser(Number(rideData.userPhoneNumber), "ride_no_drivers", null);
            }

            this.notifyOfferedDriversSearchStopped({ rideId });

        } catch (err: any) {
            if (err?.message === "Aborted") return;
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
            d => d.driverId === lastDriverId
        );

        // if last driver not found (e.g. driver list changed)
        if (idx === -1) return drivers[0];

        return drivers[(idx + 1) % drivers.length];
    },

    createStageRunner(ctx: {
        rideId: string;
        rideKey: string;
        acceptKey: string;
        signal?: AbortSignal;

        checkStop: () => Promise<boolean>;
        fetchCandidatesInRadius: (radiusKm: number) => Promise<DriverCandidate[]>;
        scoreAndSort: (candidates: DriverCandidate[]) => Promise<DriverCandidate[]>;
        canAttempt: (driverId: string, isSingleOfferUi: boolean, now?: number) => boolean;
        markAttempt: (driverId: string, isSingleOfferUi: boolean, now?: number) => void;

        reserveAndEmit: (
            candidate: DriverCandidate,
            rideData: Record<string, string>,
            ttlMs: number,
            isSingleOfferUi: boolean
        ) => Promise<{ ok: boolean; driverId: string }>;

        cleanupOffer: (driverId: string) => Promise<void>;
    }) {
        let cachedRideData: Record<string, string> | undefined;

        const getRideData = async () => {
            if (!cachedRideData) cachedRideData = await redis.hGetAll(ctx.rideKey);
            return cachedRideData;
        };

        return async function runStage(spec: StageSpec): Promise<{
            acceptedDriverId: string | null;
        }> {
            if (await ctx.checkStop()) return { acceptedDriverId: null };

            const candidates = await ctx.fetchCandidatesInRadius(spec.radiusKm);
            if (!candidates.length) return { acceptedDriverId: null };

            const sorted = await ctx.scoreAndSort(candidates);
            const eligible = sorted.filter(c => ctx.canAttempt(c.driverId, spec.isSingleOfferUi));
            const batch = spec.batchSize !== null ? eligible.slice(0, spec.batchSize) : eligible;

            if (!batch.length) return { acceptedDriverId: null };

            const rideData = await getRideData();
            const reservedDriverIds: string[] = [];

            await Promise.all(
                batch.map(async (cand) => {
                    const { ok, driverId } = await ctx.reserveAndEmit(
                        cand,
                        rideData,
                        spec.ttlMs,
                        spec.isSingleOfferUi
                    );
                    if (ok) {
                        ctx.markAttempt(driverId, spec.isSingleOfferUi);
                        reservedDriverIds.push(driverId);
                    }
                })
            );

            if (!reservedDriverIds.length) return { acceptedDriverId: null };

            const acceptedDriverId = await RideService.waitForAcceptanceWithFallback(
                ctx.rideId,
                "*",
                spec.ttlMs,
                ctx.signal
            );

            if (acceptedDriverId) return { acceptedDriverId };

            // cleanup if timed out
            if (!(await redis.get(ctx.acceptKey))) {
                await Promise.all(reservedDriverIds.map(async (id) => {
                    await ctx.cleanupOffer(id);
                    await Promise.all([
                        emitToDriver(id, "ride_search_stopped", { rideId: ctx.rideId }),
                        emitToDriver(`${id}-bg`, "ride_search_stopped", { rideId: ctx.rideId }),
                    ]);
                }));
            }

            return { acceptedDriverId: null };
        };
    },

    async restartSearching(data: { rideId: string, pickup: { latitude: number; longitude: number }, phone?: number, options?: string[], driverId: string, rideType: string; }) {
        const { rideId, pickup, phone, options, driverId, rideType } = data;

        const attempts = this.getAttempts(rideId);

        // Stop any in-memory loop (if running)
        this.stopSearching(rideId);

        // Release distributed lock so requestRide-style flow can start again
        await redis.del(RideKeys.searchLock(rideId));

        // Remove cancel key if you use it to stop searches
        await redis.del(RideKeys.cancel(rideId));

        // Start again
        const controller = new AbortController();
        rideSearchControllers.set(rideId, controller);

        attempts.set(driverId, {
            count: 2,
            lastTs: Date.now(),
            declined: false,
            hadSingleOffer: false,
        });

        this.searchForDriversSequential(rideId, rideType, pickup, phone, controller.signal, options)
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
        isSingleOffer: boolean,
        ttlMs?: number,
    ) {
        const travelTimeMin = calculateApproxTime(candidate.distKm);

        const isDelivery = rideData.isDelivery === "1";
        const delivery = isDelivery && rideData.deliveryData
            ? JSON.parse(rideData.deliveryData)
            : null;

        return {
            type: 'ride_request',
            channelKey: isSingleOffer ? "ride_channel_v7" : "ride_channel_parallel_v7",
            title: isSingleOffer ? "Sizga yangi buyurtma bor" : "O'rtadagi buyurtma",
            ride_id: rideId,
            ttlMs: ttlMs ?? 9000,
            phone: rideData.userPhoneNumber ?? '',
            chatId: rideData.userChatId ?? '',
            pickup: JSON.stringify({
                lat: Number(rideData.pickupLat),
                lng: Number(rideData.pickupLon),
                address: rideData.pickupAddress ?? '',
            }),
            travelDistance: candidate.distKm.toFixed(2),
            travelTime: travelTimeMin.toString(),
            rideType: rideData.rideType ?? "standard",

            isDelivery,
            delivery,

            useBalance: rideData.useBalance === "1",
            passengerBalance: Number(rideData.passengerBalance ?? 0),
        };
    },

    // RideService.ts
    async clearDriverRideState(rideId: string, event: string, cancelReasonLabel?: string | null) {

        const rideKey = `ride:${rideId}`;

        const rideData = await redis.hGetAll(rideKey);
        if (!rideData || Object.keys(rideData).length === 0) {
            const err = new Error(`Ride ${rideId} not found`);
            (err as any).statusCode = 404; // or use a proper HttpError class
            throw err;
        }
        const driverId = rideData.driverId;

        if (!driverId) {
            console.warn(`No driver assigned for ride ${rideId}`);
            return;
        }

        await driverSessionStore.markAvailable(driverId);

        const payload: Record<string, unknown> = { rideId };
        if (cancelReasonLabel) payload.cancelReasonLabel = cancelReasonLabel;

        emitToDriver(driverId, event, payload);
        await Promise.all([
            redis.del(`driver_offer:${driverId}`),
            redis.del(`driver_offer_payload:${driverId}`),
        ]);

        await FcmService.sendDriverMessage({ id: driverId, title: "Mijoz buyurtmani bekor qildi", body: "" });
    },

    async acceptRide(rideId: string, driverId: string) {
        console.time("ACCEPT RIDE");

        // Guard: session may have expired while driver was still in presence sets
        const session = await driverSessionStore.getCurrentSession(driverId);
        if (!session) {
            await driverSessionStore.setOffline(driverId);
            return { success: false, reason: "DRIVER_SESSION_EXPIRED" };
        }

        const now = Date.now();
        const rideKey = `ride:${rideId}`;
        const acceptKey = `ride_accept:${rideId}`;
        const reservationKey = `ride_reservation:${rideId}:${driverId}`;
        const driverOfferKey = `driver_offer:${driverId}`;
        const rideActiveTtlMs = RideConfig.RIDE_ACTIVE_TTL_SECONDS * 1000;

        // 1️⃣ CORE (critical path)
        const result = await this.acceptRideCore({
            rideId,
            driverId,
            now,
            rideKey,
            acceptKey,
            reservationKey,
            driverOfferKey,
            rideActiveTtlMs,
        });

        if (!result.success) return result;

        const { userPhone } = result;
        // 3️⃣ SIDE EFFECTS (non-blocking 🚀)
        this.acceptRideSideEffects({ rideId, driverId, userPhone });

        console.timeEnd("ACCEPT RIDE");

        return { success: true, rideId, driverId };
    },

    async acceptRideCore(params: {
        rideId: string;
        driverId: string;
        now: number;
        rideKey: string;
        acceptKey: string;
        reservationKey: string;
        driverOfferKey: string;
        rideActiveTtlMs: number;
    }) {
        const {
            rideId, driverId, now,
            rideKey, acceptKey,
            reservationKey, driverOfferKey,
            rideActiveTtlMs
        } = params;

        const result = await redis.eval(ACCEPT_RIDE_LUA, {
            keys: [rideKey, acceptKey, reservationKey],
            arguments: [driverId, now.toString(), rideActiveTtlMs.toString()],
        });

        const [accepted, reason] = result as [number, string];
        if (accepted === 0) return { success: false, reason };

        // stop search immediately (don’t await heavy stuff)
        this.stopSearching(rideId);
        attemptsByRide.delete(rideId);
        redis.hIncrBy(`driver_stats:${driverId}`, "acceptCount", 1).catch(() => { });

        const tx = redis.multi()
            .del(reservationKey)
            .del(driverOfferKey)
            .del(`driver_offer_payload:${driverId}`)
            .hSet(rideKey, { phase: "accepted" })
            .publish("ride.accepted", JSON.stringify({ rideId, driverId }))
            .hmGet(rideKey, "userPhoneNumber");

        const res = await tx.exec() as [any, any, any, any, any, any, [string | null]];
        const userPhone = Number(res?.[5]?.[0]);
        await driverSessionStore.markUnavailable(driverId);

        return { success: true, userPhone };
    },


    async acceptRideSideEffects({
        rideId,
        driverId,
        userPhone
    }: {
        rideId: string;
        driverId: string;
        userPhone?: number;
    }) {
        try {
            const [driverSession, rideData] = await Promise.all([
                driverSessionStore.getCurrentSession(driverId),
                redis.hGetAll(`ride:${rideId}`),
                RideModel.findByIdAndUpdate(rideId, { driverId, status: "accepted" }),
                driverSessionStore.upsertSession({ driverId, userPhoneNumber: userPhone })
            ]);

            console.log("DRIVER SESSION", driverSession);


            let restaurantId: string | undefined;

            if (rideData.isDelivery === "1" && rideData.deliveryData) {
                const delivery: DeliveryData = JSON.parse(rideData.deliveryData);

                restaurantId = delivery.restaurantId;

                await OrderModel.findByIdAndUpdate(
                    delivery.orderId,
                    { courierId: new Types.ObjectId(driverId) }
                );
            }

            emitToUser(userPhone, "ride_accepted", {
                rideId,
                driverId,
                ...driverSession,
            });

            if (restaurantId) {
                emitToRestaurant(restaurantId, 'driver_accepted_order', {});
            }

            // fire-and-forget FCM
            if (userPhone) this.sendPassengerMessage({
                userPhone,
                title: `${driverSession?.carColor}, ${driverSession?.carModel}`,
                body: "🚗 Haydovchi yo'lda",
            });

            void this.computeAndEmitRoute({
                rideId,
                driverId,
                userPhone,
            });
        } catch (err) {
            console.error("SideEffects failed:", err);
        }
    },

    async computeAndEmitRoute({
        rideId,
        driverId,
        userPhone,
    }: {
        rideId: string;
        driverId: string;
        userPhone?: number;
    }) {
        try {
            const [rideData, driverSession] = await Promise.all([
                redis.hGetAll(`ride:${rideId}`),
                driverStoreRedis.get(driverId),
            ]);

            if (!rideData || !driverSession?.location) return;

            const driverLocation = driverSession.location;

            const pickup = {
                lat: Number(rideData.pickupLat),
                lng: Number(rideData.pickupLon),
            };

            const start = {
                lat: Number(driverLocation.latitude),
                lng: Number(driverLocation.longitude),
            }

            console.time("PICKUP-ROUTE");

            const route = await DirectionsService.getRoute(
                start,
                pickup
            );
            console.timeEnd("PICKUP-ROUTE");
            console.log("ROUTE:", route);
            if (!route) return;

            const payload = {
                rideId,
                distanceMeters: route.distanceMeters,
                duration: route.duration,
                polyline: route.polyline,
                points: route.points,
            };

            // 🚀 emit to BOTH
            const [firstEmitted] = await Promise.all([
                emitToDriver(driverId, "route_update", payload),
                emitToDriver(`${driverId}-bg`, "route_update", payload),
                emitToUser(userPhone, "route_update", payload),
            ]);

            await RideModel.findByIdAndUpdate(rideId, {
                pickup_directions: route,
            });
            console.log(firstEmitted);
        } catch (err) {
            console.error("Route side-effect failed:", err);
        }
    },


    async sendPassengerMessage(params: { userPhone: number, title: string, body: string }) {
        const { userPhone, title, body } = params;

        const passengerPromise = PassengerModel.findOne({ phone: userPhone })
            .select("fcmToken")
            .lean()
            .exec();

        void passengerPromise
            .then((p) => {
                const token = p?.fcmToken;
                if (!token) return;

                return sendToToken({
                    token,
                    title,
                    body,
                    data: {},
                    sound: "taxi_ringtone_parallel",
                    channelId: "default_channel",
                });
            })
            .catch((err) => {
                console.error("Passenger lookup / FCM send failed:", err);
            });
    },

    async notifyOfferedDriversSearchStopped(params: {
        rideId: string;
        winnerDriverId?: string;        // present when accepted
        cleanupKeys?: boolean;          // default true
        deleteOfferedSet?: boolean;     // default true
    }) {
        const {
            rideId,
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
                        .del(`driver_offer_payload:${id}`)
                        .exec();
                }

                const payload = {
                    rideId,
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


    async stopSearching(rideId: string) {
        const acceptKey = `ride_accept:${rideId}`;
        const cancelKey = `ride_cancel:${rideId}`;

        const controller = rideSearchControllers.get(rideId);
        controller?.abort();
        rideSearchControllers.delete(rideId);

        await redis.set(cancelKey, "1", { EX: 60 }); // short TTL to signal cancellation
        await redis.del(acceptKey);

        this.notifyOfferedDriversSearchStopped({ rideId });
    },

    async completeRideGhostRide({ driverId, data }: { driverId: string, data: CompleteGhostRideRequestBody }) {
        const commission = await handleRideCommission(driverId, Number(data.fare));
        await RideRepository.createGostRide({ ...data, commission, driverId });
    },

    async completeRide(data: RideCompletedPayload) {
        const { rideId, driverId, distance, fare, pauseSeconds } = data;

        await driverSessionStore.markAvailable(driverId);
        const rideData = { endedAt: new Date(), fare, distanceTraveled: distance, pauseSeconds };
        RideRepository.setRideStatus(rideId, "completed", { by: "driver" }, rideData);

        // Deduct driver commission
        handleRideCommission(driverId, Number(data.fare));

        // Transfer passenger balance to driver cashbackBalance (if passenger opted in)
        const ride = await RideModel.findById(rideId).select("useBalance userPhoneNumber").lean();
        if (ride?.useBalance && ride.userPhoneNumber) {
            const passenger = await PassengerModel.findOne({ phone: ride.userPhoneNumber });
            if (passenger && passenger.balance > 0) {
                const transfer = Math.min(passenger.balance, Number(fare));
                await PassengerModel.findByIdAndUpdate(passenger._id, { $inc: { balance: -transfer } });
                await DriverModel.findByIdAndUpdate(driverId, { $inc: { wallet: transfer } });
            }
        }

        // Credit cashback reward to passenger balance
        handlePassengerCashback(ride?.userPhoneNumber).catch(err =>
            console.error("Passenger cashback failed:", err)
        );

        // For delivery rides, also deduct restaurant commission on itemsSubtotal
        this.handleDeliveryRestaurantCommission(rideId).catch(err =>
            console.error("Restaurant commission failed:", err)
        );

        console.timeEnd("COMPLETE RIDE");
        return {
            success: true,
            rideId,
            driverId,
            distance,
            fare,
        };
    },

    markDriverDecline(rideId: string, driverId: string) {
        const attempts = attemptsByRide.get(rideId);
        if (!attempts) return;
        const prev = attempts.get(driverId);
        attempts.set(driverId, {
            count: prev?.count ?? 0,
            lastTs: Date.now(),
            declined: true,
            hadSingleOffer: prev?.hadSingleOffer ?? false,
        });
    },

    async handleDeliveryRestaurantCommission(rideId: string) {
        const ride = await RideModel.findById(rideId).select("isDelivery orderId").lean();
        if (!ride?.isDelivery || !ride.orderId) return;

        const order = await OrderModel.findById(ride.orderId)
            .select("restaurantId pricing")
            .lean();
        if (!order) return;

        const restaurant = await RestaurantModel.findById(order.restaurantId)
            .select("commission_percent")
            .lean();
        if (!restaurant) return;

        const commissionRate = (restaurant.commission_percent ?? 0) / 100;
        const commission = order.pricing.itemsSubtotal * commissionRate;

        if (commission > 0) {
            await RestaurantModel.findByIdAndUpdate(
                order.restaurantId,
                { $inc: { balance: -commission } }
            );
        }
    },
}