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


const OFFER_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 1000; // while waiting for acceptance, poll DB every second

// In-process guards (replace with distributed locks in multi-instance)
const processingRides = new Set<string>();

function sleep(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
}

/**
 * Safely send offers to candidate drivers, one at a time.
 * - Claim driver atomically before sending the FCM offer.
 * - If sending fails or driver has no token, remove that candidate and continue.
 * - Wait for acceptance (poll) until offer expires; then continue to next candidate.
 *
 * NOTE: If you run multiple Node processes, replace the `processingRides` Set
 * with a Redis-based distributed lock to avoid cross-process races.
 */
export async function sendOfferToNextDriverSafe(rideId: string) {
    if (processingRides.has(rideId)) {
        // Already processing this ride on this instance
        return;
    }
    processingRides.add(rideId);

    try {
        while (true) {
            // fetch latest ride
            const ride = await RideModel.findById(rideId).lean();
            if (!ride) return;

            // If already accepted/started/arrived, stop processing
            if (["accepted", "started", "arrived"].includes(ride.status)) return;

            // If no more candidates → cancel ride and notify user
            if (!ride.candidateDrivers || ride.candidateDrivers.length === 0) {
                const userSocketId = userSockets.get(ride.userChatId);
                if (userSocketId) {
                    socketIo.to(userSocketId).emit("ride_no_drivers");
                }
                await RideRepository.updateRide(rideId, { status: "cancelled" });
                return;
            }

            // Pick next candidate (always pick the first element)
            const candidate = ride.candidateDrivers[0];
            const nextDriverId = candidate.driverId.toString();

            // ATTEMPT TO CLAIM this driver atomically:
            // Only claim if ride is still in a state that allows offering and
            // either offeredTo is null/expired or offeredTo is this driver.
            const now = new Date();
            const claimFilter = {
                _id: rideId,
                status: { $in: ["pending", "offered"] },
                $or: [
                    { offeredTo: null },
                    { offeredTo: nextDriverId }, // re-claim if same
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

            // Atomically claim the offer. If another process claimed it, 'claimed' will be null.
            const claimed = await RideModel.findOneAndUpdate(claimFilter, claimUpdate, {
                new: true,
            }).lean();

            if (!claimed) {
                // Race: someone else claimed or ride no longer in a valid state. Retry loop.
                continue;
            }

            // If driver session doesn't exist or has no fcm token → skip candidate and continue.
            const driverSession = driverStore.get(nextDriverId);
            if (!driverSession?.fcmToken) {
                // remove candidate
                await RideRepository.pullDriverCandidate(rideId, nextDriverId);
                // clear any stale offeredTo if it still points to this driver
                await RideModel.findOneAndUpdate(
                    { _id: rideId, offeredTo: nextDriverId },
                    { $unset: { offeredTo: "" }, $set: { offerExpiresAt: null } }
                );
                continue;
            }

            // Send the actual ride offer (FCM)
            const distKm = candidate.distKm;
            const travelTime = calculateApproxTime(distKm);
            const offerSent = await sendRideOffer({
                id: claimed._id,
                pickup: claimed.pickup,
                userChatId: claimed.userChatId,
                travelDistance: distKm?.toFixed?.(2) ?? String(distKm),
                travelTime,
                fcmToken: driverSession.fcmToken,
                driverId: nextDriverId,
            });

            if (!offerSent) {
                // FCM failed; remove candidate and clear the claim
                await RideRepository.pullDriverCandidate(rideId, nextDriverId);
                await RideModel.findOneAndUpdate(
                    { _id: rideId, offeredTo: nextDriverId },
                    { $unset: { offeredTo: "" }, $set: { offerExpiresAt: null } }
                );
                continue;
            }

            // Offer successfully sent and atomically recorded. Now wait for acceptance or timeout.
            const waitUntil = Date.now() + OFFER_TIMEOUT_MS;
            let accepted = false;

            while (Date.now() < waitUntil) {
                await sleep(POLL_INTERVAL_MS);

                const fresh = await RideModel.findById(rideId).lean();
                if (!fresh) {
                    // ride deleted? stop processing
                    return;
                }

                // someone accepted or ride progressed to final states
                if (["accepted", "started", "arrived"].includes(fresh.status)) {
                    accepted = true;
                    break;
                }

                // offeredTo changed → our candidate was replaced / claimed by another process → break to outer loop
                if (fresh.offeredTo?.toString() !== nextDriverId) {
                    // Another actor changed the offeredTo -> re-evaluate from top
                    break;
                }

                // not accepted yet — continue polling until timeout
            }

            if (accepted) {
                // done — driver accepted; return and stop processing
                return;
            }

            // Offer expired (or offeredTo changed); if offeredTo still equals nextDriverId and expired, remove the candidate and offeredTo fields.
            const finalCheck = await RideModel.findById(rideId).lean();
            if (!finalCheck) return;

            // If still offeredTo the same driver and the offer is expired, remove that candidate and clear offered fields
            if (
                finalCheck.offeredTo?.toString() === nextDriverId &&
                (!finalCheck.offerExpiresAt || finalCheck.offerExpiresAt.getTime() <= Date.now())
            ) {
                await RideRepository.pullDriverCandidate(rideId, nextDriverId);
                await RideModel.findOneAndUpdate(
                    { _id: rideId, offeredTo: nextDriverId },
                    { $unset: { offeredTo: "" }, $set: { offerExpiresAt: null } }
                );
                // loop will continue and try next candidate
                continue;
            }

            // Otherwise (someone else changed the ride) — go back to top and re-evaluate
        } // end outer while
    } catch (err) {
        console.error("sendOfferToNextDriverSafe error:", err);
        // Optionally notify admin/logging
    } finally {
        processingRides.delete(rideId);
    }
}