import { DriverModel } from "../models/DriverModel";
import { RideModel } from "../models/Ride";
import { RideRepository } from "../repositories/ride.repository";
import { RideOfferPaylod } from "../services/ride.service";
import admin from 'firebase-admin';
import { calculateApproxTime } from "./calculateApproxTime";
import { sendRideOffer } from "./sendRideOffer";
import { socketIo } from "../gateway/socket2";
import { userSockets } from "../gateway/socket.maps";
import { driverStore } from "../store/driverStore";
import { emitToDriver } from "../gateway/ride.socket";
import { driverStoreRedis } from "../store/driverStoreRedis";

const OFFER_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 1000; // poll DB every second
const processingRides = new Set<string>();

function sleep(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
}

/**
 * Sequential offer to a single driver (waits for acceptance or timeout)
 */
export async function sendOfferToDriverSequentially(rideId: string, candidate: any): Promise<boolean> {
    const nextDriverId = candidate.driverId.toString();
    console.log(`🚀 Trying sequential offer for ride ${rideId} to driver ${nextDriverId}`);

    const now = new Date();
    const claimFilter = {
        _id: rideId,
        status: { $in: ["pending", "offered"] },
        $or: [
            { offeredTo: null },
            { offeredTo: nextDriverId },
            { offerExpiresAt: { $lte: now } },
            { offerExpiresAt: { $exists: false } },
        ],
    } as any;

    const claimUpdate = {
        $set: {
            offeredTo: nextDriverId,
            offerExpiresAt: new Date(Date.now() + OFFER_TIMEOUT_MS),
            status: "offered",
        },
    };

    const claimed = await RideModel.findOneAndUpdate(claimFilter, claimUpdate, { new: true }).lean();
    if (!claimed) {
        console.log(`❌ Ride ${rideId} could not be claimed by driver ${nextDriverId}`);
        return false;
    }

    const driverSession = await driverStoreRedis.get(nextDriverId);
    // if (!driverSession?.fcmToken) {
    //     console.log(`⚠️ Driver ${nextDriverId} has no FCM token, removing candidate`);
    //     await RideRepository.pullDriverCandidate(rideId, nextDriverId);
    //     await RideModel.findOneAndUpdate(
    //         { _id: rideId, offeredTo: nextDriverId },
    //         { $unset: { offeredTo: "" }, $set: { offerExpiresAt: null } }
    //     );
    //     return false;
    // }

    const distKm = candidate.distKm;
    const travelTime = calculateApproxTime(distKm);
    console.log(`📩 Sending offer to driver ${nextDriverId} (dist: ${distKm} km, ETA: ${travelTime} min)`);
    emitToDriver(nextDriverId, "ride_offered", {
        'driverId': nextDriverId,
        'rideId': rideId,
    });
    const offerSent = await sendRideOffer({
        id: claimed._id,
        pickup: { latitude: 0.0, longitude: 0.0 },
        userPhoneNumber: claimed.userPhoneNumber,
        userChatId: claimed.userChatId,
        travelDistance: distKm?.toFixed?.(2) ?? String(distKm),
        travelTime,
        // fcmToken: driverSession.fcmToken,
        driverId: nextDriverId,
    });

    if (!offerSent) {
        console.log(`❌ Offer failed to send to driver ${nextDriverId}, removing candidate`);
        await RideRepository.pullDriverCandidate(rideId, nextDriverId);
        await RideModel.findOneAndUpdate(
            { _id: rideId, offeredTo: nextDriverId },
            { $unset: { offeredTo: "" }, $set: { offerExpiresAt: null } }
        );
        return false;
    }

    // Mark driver as being offered
    driverStoreRedis.markAsOffered(nextDriverId);

    console.log(`⏳ Waiting for driver ${nextDriverId} to accept the offer...`);
    const waitUntil = Date.now() + OFFER_TIMEOUT_MS;
    while (Date.now() < waitUntil) {
        await sleep(POLL_INTERVAL_MS);
        const fresh = await RideModel.findById(rideId).lean();
        if (!fresh) return false;

        if (["accepted", "started", "arrived"].includes(fresh.status)) {
            console.log(`✅ Driver ${nextDriverId} accepted the ride ${rideId}`);
            await RideModel.updateOne(
                { _id: rideId },
                { $unset: { offeredTo: "", offerExpiresAt: "" } }
            );
            return true;
        }

        if (fresh.offeredTo?.toString() !== nextDriverId) {
            console.log(`⚠️ Offer to driver ${nextDriverId} was overridden`);
            return false;
        }
    }

    console.log(`⏰ Offer to driver ${nextDriverId} expired, cleaning up`);
    driverStoreRedis.clearOffer(nextDriverId);
    const finalCheck = await RideModel.findById(rideId).lean();
    if (finalCheck?.offeredTo?.toString() === nextDriverId) {
        await RideRepository.pullDriverCandidate(rideId, nextDriverId);
        await RideModel.findOneAndUpdate(
            { _id: rideId, offeredTo: nextDriverId },
            { $unset: { offeredTo: "" }, $set: { offerExpiresAt: null } }
        );
    }

    return false;
}

/**
 * Parallel offer to a single driver with cancellation and DB cleanup on acceptance
 */
async function sendOfferToDriverParallel(rideId: string, candidate: any, cancelSignal: { cancelled: boolean }) {
    const nextDriverId = candidate.driverId.toString();
    if (cancelSignal.cancelled) return;

    console.log(`🚀 Trying parallel offer for ride ${rideId} to driver ${nextDriverId}`);
    const now = new Date();
    const claimFilter = {
        _id: rideId,
        status: { $in: ["pending", "offered"] },
        $or: [
            { offeredTo: null },
            { offeredTo: nextDriverId },
            { offerExpiresAt: { $lte: now } },
            { offerExpiresAt: { $exists: false } },
        ],
    } as any;

    const claimUpdate = {
        $set: {
            offeredTo: nextDriverId,
            offerExpiresAt: new Date(Date.now() + OFFER_TIMEOUT_MS),
            status: "offered",
        },
    };

    const claimed = await RideModel.findOneAndUpdate(claimFilter, claimUpdate, { new: true }).lean();
    if (!claimed) {
        console.log(`❌ Ride ${rideId} could not be claimed by driver ${nextDriverId}`);
        return;
    }

    const driverSession = await driverStoreRedis.get(nextDriverId);
    // if (!driverSession?.fcmToken) {
    //     console.log(`⚠️ Driver ${nextDriverId} has no FCM token, removing candidate`);
    //     await RideRepository.pullDriverCandidate(rideId, nextDriverId);
    //     await RideModel.findOneAndUpdate(
    //         { _id: rideId, offeredTo: nextDriverId },
    //         { $unset: { offeredTo: "" }, $set: { offerExpiresAt: null } }
    //     );
    //     return;
    // }

    const distKm = candidate.distKm;
    const travelTime = calculateApproxTime(distKm);
    console.log(`📩 Sending offer to driver ${nextDriverId} (dist: ${distKm} km, ETA: ${travelTime} min)`);

    const offerSent = await sendRideOffer({
        id: claimed._id,
        pickup: { latitude: 0.0, longitude: 0.0 },
        userPhoneNumber: claimed.userPhoneNumber,
        userChatId: claimed.userChatId,
        travelDistance: distKm?.toFixed?.(2) ?? String(distKm),
        travelTime,
        // fcmToken: driverSession.fcmToken,
        driverId: nextDriverId,
    });

    if (!offerSent) {
        console.log(`❌ Offer failed to send to driver ${nextDriverId}, removing candidate`);
        await RideRepository.pullDriverCandidate(rideId, nextDriverId);
        await RideModel.findOneAndUpdate(
            { _id: rideId, offeredTo: nextDriverId },
            { $unset: { offeredTo: "" }, $set: { offerExpiresAt: null } }
        );
        return;
    }

    console.log(`⏳ Polling for acceptance from driver ${nextDriverId}...`);
    const waitUntil = Date.now() + OFFER_TIMEOUT_MS;
    while (Date.now() < waitUntil && !cancelSignal.cancelled) {
        await sleep(POLL_INTERVAL_MS);
        const fresh = await RideModel.findById(rideId).lean();
        if (!fresh) return;

        if (["accepted", "started", "arrived"].includes(fresh.status)) {
            console.log(`✅ Driver ${nextDriverId} accepted the ride ${rideId}, cancelling others`);
            cancelSignal.cancelled = true;
            await RideModel.updateOne(
                { _id: rideId },
                { $unset: { offeredTo: "", offerExpiresAt: "" } }
            );
            return;
        }

        if (fresh.offeredTo?.toString() !== nextDriverId) {
            console.log(`⚠️ Offer to driver ${nextDriverId} was overridden`);
            return;
        }
    }

    console.log(`⏰ Offer to driver ${nextDriverId} expired, cleaning up`);
    const finalCheck = await RideModel.findById(rideId).lean();
    if (finalCheck?.offeredTo?.toString() === nextDriverId) {
        await RideRepository.pullDriverCandidate(rideId, nextDriverId);
        await RideModel.findOneAndUpdate(
            { _id: rideId, offeredTo: nextDriverId },
            { $unset: { offeredTo: "" }, $set: { offerExpiresAt: null } }
        );
    }
}

/**
 * Main function: top 3 sequential, remaining parallel with cancellation and DB cleanup
 */
export async function sendOfferToDrivers(rideId: string) {
    if (processingRides.has(rideId)) {
        console.log(`⚠️ Ride ${rideId} is already being processed`);
        return;
    }
    processingRides.add(rideId);
    console.log(`🚦 Starting to send offers for ride ${rideId}`);

    try {
        const ride = await RideModel.findById(rideId).lean();
        if (!ride) return;

        if (!ride.candidateDrivers || ride.candidateDrivers.length === 0) {
            console.log(`❌ No candidate drivers for ride ${rideId}`);
            const userSocketId = userSockets.get(ride.userChatId);
            if (userSocketId) socketIo.to(userSocketId).emit("ride_no_drivers");
            await RideRepository.updateRide(rideId, { status: "cancelled" });
            return;
        }

        // --- Top 3 sequential ---
        const top3 = ride.candidateDrivers.slice(0, 3);
        for (const candidate of top3) {
            const accepted = await sendOfferToDriverSequentially(rideId, candidate);
            if (accepted) return;
        }

        // --- Remaining candidates in parallel ---
        const remaining = ride.candidateDrivers.slice(3);
        const cancelSignal = { cancelled: false };
        await Promise.all(remaining.map((c) => sendOfferToDriverParallel(rideId, c, cancelSignal)));
    } catch (err) {
        console.error("🔥 sendOfferToDrivers error:", err);
    } finally {
        processingRides.delete(rideId);
        console.log(`✅ Finished processing ride ${rideId}`);
    }
}
