import { RideRepository } from "../repositories/ride.repository";
import { DriverRepository } from "../repositories/driver.repository";
import { haversineDistanceKm } from "../utils/haversine";
import { calculateEstimate } from "../utils/fare";
import { MAX_DRIVER_DISTANCE_KM } from "../config/constants";
import { logger } from "../utils/logger";
import { DriverModel, IDriverDocument } from "../models/DriverModel";
import { calculateApproxTime } from "../utils/calculateApproxTime";
import { DriverLocation } from "../types/location";
import { DriverSession } from "../store/driverStore";
import admin from 'firebase-admin';
import { sendRideOffer } from "../utils/sendRideOffer";
import { sendOfferToNextDriver } from "../utils/sendOfferToNextDriver";

export interface RideRequestInput {
    chatId: string;
    location: { lat: number; lon: number };
    dropoff?: { lat: number; lon: number; address?: string };
    address?: string;
}

export interface RideOfferPaylod {
    id: string;
    pickup: DriverLocation;
    userChatId: number;
    travelDistance: string;
    travelTime: number;
    fcmToken: string | undefined;
    driverId: string;
}


export const RideService = {
    async requestRide(input: RideRequestInput) {
        const { chatId, location, dropoff, address } = input;

        // 1) Create the ride
        const ride = await RideRepository.createRide({
            userChatId: chatId,
            pickup: { lat: location.lat, lon: location.lon, address },
            dropoff: dropoff
                ? { lat: dropoff.lat, lon: dropoff.lon, address: dropoff.address }
                : undefined,
            status: "pending",
        })
        // 2) Get drivers sorted by distances
        const drivers = await DriverRepository.findAvailableDrivers(location.lat, location.lon);
        if (!drivers.length) {
            await RideRepository.updateRide(ride._id, {
                status: "cancelled",
            });
            return { message: "Yaqin atrofda haydovchilar topilmadi", drivers: 0, rideId: ride._id };
        }
        const nearest = drivers[0];

        // 3) Attach the list of candidates to the ride
        const candidateDrivers = drivers.map((d) => {
            return { driverId: d.driver.driverId, distKm: d.distKm }
        });
        await RideRepository.updateRide(ride._id, { candidateDrivers });

        await RideRepository.updateRide(ride._id, { driverId: nearest.driver.driverId });
        // 4) Start offering process
        sendOfferToNextDriver(ride._id);
        // const travelTime = calculateApproxTime(nearest.distKm);
        // await RideRepository.updateRide(ride._id, { status: "offered" });

        // const offerPayload = {
        //     id: ride._id,
        //     pickup: ride.pickup,
        //     userChatId: ride.userChatId,
        //     travelDistance: nearest.distKm.toFixed(2),
        //     travelTime,
        //     fcmToken: nearest.driver.fcmToken,
        //     driverId: nearest.driver.driverId,
        // };

        // logger.info("📨 Sending ride offer to:", nearest.driver.driverId);
        // let sent = await sendRideOffer(offerPayload);

        // if (!sent) {
        //     logger.warn("Primary driver failed; trying next nearest...");
        //     for (const candidate of distances.slice(1)) {
        //         offerPayload.driverId = candidate.driver.driverId;
        //         offerPayload.fcmToken = candidate.driver.fcmToken;

        //         sent = await sendRideOffer(offerPayload);
        //         if (sent) break;
        //     }
        // }

        // return sent
        //     ? { message: "Driver found, waiting for acceptance...", rideId: ride._id }
        //     : { message: "No drivers responded", rideId: ride._id };

        return { message: "Ride created, offering drivers...", drivers: drivers, rideId: ride._id };
    },
};

