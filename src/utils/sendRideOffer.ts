import { DriverModel } from "../models/DriverModel";
import { RideModel } from "../models/Ride";
import { RideRepository } from "../repositories/ride.repository";
import { RideOfferPaylod } from "../services/ride.service";
import admin from 'firebase-admin';
import { calculateApproxTime } from "./calculateApproxTime";
import { emitToDriver } from "../gateway/ride.socket";

export const sendRideOffer = async (rideOffer: RideOfferPaylod) => {
    const data = {
        type: 'ride_request',
        ride_id: rideOffer.id.toString(),
        phone: rideOffer.userPhoneNumber?.toString() ?? '',
        pickup: JSON.stringify(rideOffer.pickup),
        travelTime: rideOffer.travelTime.toString(),
        chatId: rideOffer.userChatId?.toString() ?? '',
        travelDistance: rideOffer.travelDistance.toString(),
    };

    try {
        const sent = emitToDriver(rideOffer.driverId, 'ride_offer', data);
        console.log(`SENT VIA SOCKET ${sent}`, rideOffer.driverId);

    } catch (error) {
        console.log(error);

    }

    if (!rideOffer.fcmToken) {
        console.log(`⚠️ No active socket or FCM token for driver ${rideOffer.driverId}`);
        return false;
    }

    const message = {
        token: rideOffer.fcmToken,
        android: {
            priority: "high" as const,
        },
        data: data,
    };

    try {
        await admin.messaging().send(message);
        console.log(`📲 Ride [${rideOffer.id}] offer sent to driver ${rideOffer.driverId} via FCM`);
        return true;
    } catch (error) {
        console.error(`❌ Error sending FCM to driver ${rideOffer.driverId}:`, error);
        return false;
    }
};

