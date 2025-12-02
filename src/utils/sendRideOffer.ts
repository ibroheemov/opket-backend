import { DriverModel } from "../models/DriverModel";
import { RideModel } from "../models/Ride";
import { RideRepository } from "../repositories/ride.repository";
import { RideOfferPaylod } from "../services/ride.service";
import admin from 'firebase-admin';
import { calculateApproxTime } from "./calculateApproxTime";

export const sendRideOffer = async (rideOffer: RideOfferPaylod) => {
    if (!rideOffer.fcmToken) {
        console.log(`⚠️ No active socket or FCM token for driver ${rideOffer.driverId}`);
        return false;
    }

    const message = {
        token: rideOffer.fcmToken,
        android: {
            priority: "high" as const,
        },
        data: {
            type: 'ride_request',
            ride_id: rideOffer.id.toString(),
            phone: rideOffer.userPhoneNumber ?? '',
            pickup: JSON.stringify(rideOffer.pickup),
            travelTime: rideOffer.travelTime.toString(),
            chatId: rideOffer.userChatId.toString(),
            travelDistance: rideOffer.travelDistance.toString(),
        },
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

