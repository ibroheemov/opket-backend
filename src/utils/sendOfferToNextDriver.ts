import { DriverModel } from "../models/DriverModel";
import { RideModel } from "../models/Ride";
import { RideRepository } from "../repositories/ride.repository";
import { RideOfferPaylod } from "../services/ride.service";
import admin from 'firebase-admin';
import { calculateApproxTime } from "./calculateApproxTime";
import { sendRideOffer } from "./sendRideOffer";
import { socketIo } from "../gateway/socket2";
import { userSockets } from "../gateway/socket.maps";

const OFFER_TIMEOUT_MS = 20_000;

export const sendOfferToNextDriver = async (rideId: string): Promise<undefined> => {
    const ride = await RideModel.findById(rideId);
    if (!ride) return;

    // 1) If already accepted → stop
    if (ride.status === "accepted" || ride.status === "started") return;

    // 2) No more drivers → cancel ride
    if (!ride.candidateDrivers?.length) {
        const userSocketId = userSockets.get(ride.userChatId);
        if (userSocketId) {
            socketIo.to(userSocketId).emit("ride_no_drivers");
        }
        await RideRepository.updateRide(rideId, { status: "cancelled" });
        return;
    }

    const nextDriver = ride.candidateDrivers[0];
    const nextDriverId = nextDriver.driverId;

    const driver = await DriverModel.findById(nextDriverId);
    if (!driver?.fcmToken) {
        await RideRepository.pullDriverCandidate(rideId, nextDriverId);
        return sendOfferToNextDriver(rideId);
    }

    // 3) Send the offer
    const distKm = nextDriver.distKm; // or your haversine value
    const travelTime = calculateApproxTime(distKm);

    const offerSent = await sendRideOffer({
        id: ride._id,
        pickup: ride.pickup,
        userChatId: ride.userChatId,
        travelDistance: distKm.toFixed(2),
        travelTime,
        fcmToken: driver.fcmToken,
        driverId: driver._id.toString(),
    });

    if (!offerSent) {
        // FCM failed → skip driver
        await RideRepository.pullDriverCandidate(rideId, nextDriverId);
        return sendOfferToNextDriver(rideId);
    }

    // 4) Mark offered driver
    await RideRepository.updateRide(rideId, {
        status: "offered",
        offeredTo: nextDriverId,
        offerExpiresAt: new Date(Date.now() + OFFER_TIMEOUT_MS),
    });

    // 5) Wait and check if driver accepted
    setTimeout(async () => {
        const updated = await RideModel.findById(rideId);

        if (updated?.status === "accepted" || updated?.status === "cancelled") return; // driver accepted

        // expired → try next driver
        await RideRepository.pullDriverCandidate(rideId, nextDriverId);

        return sendOfferToNextDriver(rideId);
    }, OFFER_TIMEOUT_MS);
};
