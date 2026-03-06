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
import { sendToToken } from "./notifications";
import { PassengerModel } from "../models/PassengerModel";

type StageMode = "single" | "all";

type StageSpec = {
    radiusKm: number;
    ttlMs: number;
    mode: StageMode;
    uiSingleOffer?: boolean; // optional: controls isSingleOfferUi
};

const rideSearchControllers = new Map<string, AbortController>();
const attemptsByRide = new Map<string, Map<string, { lastTs: number; count: number }>>();

const MAX_SEARCH_TIME_MS = 3 * 60 * 1000;
const OFFERED_SET_EX_SECONDS = 300;
const REOFFER_AFTER_MS = 10_000;  // 
const LOOP_GAP_MS = 250;            // small pause between phases
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

        this.searchForDriversSequential(rideId, rideType, location, phone, controller.signal, options).catch((err) => {
            if (err?.message === "Aborted") return;
            console.error("Search failed:", err);
        });

        return { ride_id: rideId };
    },

    async searchForDriversSequential(
        rideId: string,
        requestedRideType: string,
        pickup: { lat: number; lon: number },
        phone?: number,
        signal?: AbortSignal,
        options?: string[],
    ) {
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

        const fetchCandidatesInRadius = async (radiusKm: number) => {
            const drivers = await DriverRepository.findAvailableDriversNew(
                pickup.lat,
                pickup.lon,
                radiusKm,
                optionsNew,
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
            const driverId = candidate.driverId;

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

        // ✅ CHANGE #2: Wrap the whole loop so "Aborted" exits quietly (no "expired")
        try {
            for (const tier of fallbackTiers) {
                // 🟢 If tier changed → update rideType + pricing
                if (tier !== currentRideType) {
                    console.log(`🔄 Fallback rideType: ${currentRideType} → ${tier}`);

                    optionsNew = optionsNew.map(t => t === currentRideType ? tier : t);
                    currentRideType = tier;

                    // 1️⃣ Update Redis
                    await redis.hSet(rideKey, { rideType: tier });

                    // 2️⃣ Update DB
                    // await RideRepository.updateRideType(rideId, tier);
                }

                // 🚀 Run stages for this tier
                const runStage = this.createStageRunner({
                    rideId,
                    rideKey,
                    acceptKey,
                    signal,
                    checkStop,
                    fetchCandidatesInRadius: (radiusKm: number) =>
                        fetchCandidatesInRadius(radiusKm),
                    canAttempt,
                    markAttempt,
                    reserveAndEmit,
                    cleanupOffer,
                });

                if ((await runStage({ radiusKm: 3, ttlMs: 8000, mode: "single" })).acceptedDriverId) return;

                await sleep(LOOP_GAP_MS);

                if ((await runStage({ radiusKm: 0.7, ttlMs: 8000, mode: "all" })).acceptedDriverId) return;

                await sleep(LOOP_GAP_MS);

                if ((await runStage({ radiusKm: 3, ttlMs: 25000, mode: "all" })).acceptedDriverId) return;
            }

            // If none of the tiers result in an accepted ride
            console.log(`⏳ Ride ${rideId} expired — no acceptance`);
            await redis.hSet(rideKey, { phase: "expired" });
            const rideData = await redis.hGetAll(rideKey);
            if (rideData.userPhoneNumber) {
                emitToUser(Number(rideData.userPhoneNumber), "ride_no_drivers", null);
            }
        } catch (err: any) {
            if (err?.message === "Aborted") return; // abort silently
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
        canAttempt: (driverId: string, now?: number) => boolean;
        markAttempt: (driverId: string, now?: number) => void;

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

            const eligible =
                spec.mode === "single"
                    ? (() => {
                        const nearest = candidates.find(c => ctx.canAttempt(c.driverId));
                        return nearest ? [nearest] : [];
                    })()
                    : candidates.filter(c => ctx.canAttempt(c.driverId));

            if (!eligible.length) return { acceptedDriverId: null };

            const rideData = await getRideData();

            const reservedDriverIds: string[] = [];

            if (spec.mode === "single") {
                const cand = eligible[0];
                const { ok, driverId } = await ctx.reserveAndEmit(
                    cand,
                    rideData,
                    spec.ttlMs,
                    spec.uiSingleOffer ?? true
                );
                if (!ok) return { acceptedDriverId: null };
                ctx.markAttempt(driverId);
                reservedDriverIds.push(driverId);
            } else {
                await Promise.all(
                    eligible.map(async (cand) => {
                        const { ok, driverId } = await ctx.reserveAndEmit(
                            cand,
                            rideData,
                            spec.ttlMs,
                            spec.uiSingleOffer ?? false
                        );
                        if (ok) {
                            ctx.markAttempt(driverId);
                            reservedDriverIds.push(driverId);
                        }
                    })
                );
                if (!reservedDriverIds.length) return { acceptedDriverId: null };
            }

            const acceptedDriverId = await RideService.waitForAcceptanceWithFallback(
                ctx.rideId,
                "*",
                spec.ttlMs,
                ctx.signal
            );

            if (acceptedDriverId) return { acceptedDriverId };

            // cleanup if timed out
            if (!(await redis.get(ctx.acceptKey))) {
                await Promise.all(reservedDriverIds.map(id => ctx.cleanupOffer(id)));
            }

            return { acceptedDriverId: null };
        };
    },

    async restartSearching(data: { rideId: string, pickup: { lat: number; lon: number }, phone?: number, options?: string[], driverId: string, rideType: string; }) {
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

    // RideService.ts
    async clearDriverRideState(rideId: string, event: string) {
        const rideKey = `ride:${rideId}`;

        const rideData = await redis.hGetAll(rideKey);
        if (!rideData || Object.keys(rideData).length === 0) {
            const err = new Error(`Ride ${rideId} not found`);
            (err as any).statusCode = 404; // or use a proper HttpError class
            throw err;
        }

        const driverId = rideData.driverId;

        emitToDriver(driverId, event, { rideId });
        emitToDriver(`${driverId}-bg`, event, { rideId });

        const driverKey = `driver:${driverId}`;
        await redis.hSet(driverKey, { currentRideId: "" });
        await redis.del(`driver_offer:${driverId}`);
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

        // Start async work (no await)
        // const driverPromise = DriverModel.findById(driverId).lean().exec();


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

                const title = `${driver?.carColor}, ${driver?.carModel}, ${driver?.regionCode}${driver?.carNumber}`;
                const body = "🚗 Haydovchi yo'lda";
                this.sendPassengerMessage({ userPhone, title, body })
            })
            .catch(err => console.error("Failed to fetch driver info:", err));

        return { success: true, rideId, driverId };
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
                    data: {}
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

    async completeRideGhostRide(data: GhostRideInput) {
        const { driverId, fare, distanceTraveled } = data;

        await RideRepository.createGostRide(data);

        // 5️⃣ Update driver in MongoDB (clear currentRideId)
        const updatedDriver = await DriverModel.findOneAndUpdate(
            { _id: driverId },
            { currentRideId: null },
            { new: true }
        );

        const commissionResult = await handleRideCommission(driverId, Number(data.fare), updatedDriver?.commissionRate);
        const { balance, commission } = commissionResult;

        // Notify driver about commission update if FCM token exists
        if (updatedDriver?.fcmToken) {
            // sendFcm(updatedDriver.fcmToken, commission);
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
        const userPhone = Number(rideData.userPhoneNumber);
        if (userPhone) {
            emitToUser(userPhone, "ride_completed", {
                rideId,
                distance,
                fare,
                driverId,
            });

            const title = 'Safar yakunlandi';
            const body = `${fare} UZS, ${distance} KM`;

            this.sendPassengerMessage({ userPhone, title, body })
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