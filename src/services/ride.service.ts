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
import { sendOfferToNextDriverSafe } from "../utils/sendOfferToNextDriver";
import { safeAsync } from "../utils/asyncHelper";
import { RideModel } from "../models/Ride";
import { Socket } from "socket.io";
import { driverStore } from "../store/driverStore";
import { socketIo, userSockets } from "../gateway/socket.maps";
import { RideCompletedPayload } from "../bot/socket/types";
import { updateRideStatus } from "../gateway/ride.socket";
import { handleRideCommission } from "../utils/fare.helper";
import { PassengerModel } from "../models/PassengerModel";

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
        sendOfferToNextDriverSafe(ride._id);

        return { message: "Ride created, offering drivers...", drivers: drivers, rideId: ride._id };
    },

    async acceptRide(
        rideId: string,
        driverId: string,
        socket: Socket,
        socketIo: any
    ) {
        // 1) Atomically accept the ride
        const now = new Date();

        const [updateErr, acceptedRide] = await safeAsync(() =>
            RideModel.findOneAndUpdate(
                {
                    _id: rideId,
                    status: "offered",                     // must be in offered state
                    offeredTo: driverId,                   // must be offered to THIS driver
                    offerExpiresAt: { $gte: now },         // offer must NOT be expired
                },
                {
                    $set: {
                        status: "accepted",
                        driverId,
                        acceptedAt: now,
                    },
                    $unset: {
                        offeredTo: "",                     // remove offer fields
                        offerExpiresAt: "",
                    },
                },
                { new: true }
            )
        );

        if (updateErr) {
            throw new Error(
                `Database error while accepting ride ${rideId}: ${updateErr.message}`
            );
        }

        if (!acceptedRide) {
            // Ride was not in the correct state → reject
            throw new Error(
                `Ride cannot be accepted. It may have expired, been offered to another driver, or already accepted.`
            );
        }

        // 2) Update driver session + database
        const [driverErr, updatedDriver] = await safeAsync(async () => {
            const driverSession = driverStore.get(driverId);

            driverStore.upsert(driverId, {
                currentRideId: acceptedRide._id.toString(),
            });

            return DriverModel.findByIdAndUpdate(
                driverId,
                { currentRideId: acceptedRide._id.toString() },
                { new: true }
            );
        });

        // 2) Update passenger database
        const [passengerErr, updatedpassenger] = await safeAsync(async () => {
            return PassengerModel.findOneAndUpdate(
                { chatId: acceptedRide.userChatId },
                { currentRideId: acceptedRide._id.toString() },
                { new: true }
            );
        });

        if (passengerErr) {
            throw new Error(
                `Error updating passenger ${acceptedRide.userChatId} on ride accept: ${passengerErr.message}`
            );
        }

        if (driverErr) {
            throw new Error(
                `Error updating driver ${driverId} on ride accept: ${driverErr.message}`
            );
        }

        // 3) Notify driver
        socket.emit("ride_status", {
            status: "accepted",
            rideId,
        });

        // 4) Notify user (if online)
        const userSocketId = userSockets.get(acceptedRide.userChatId);

        if (userSocketId) {
            const driverSession = driverStore.get(driverId);

            socketIo.to(userSocketId).emit("ride_assigned", {
                rideId: acceptedRide._id.toString(),
                driver: updatedDriver,
                location: driverSession?.location,
                message: "🚗 Your driver is on the way!",
            });
        }
    },

    async completeRide(driverId: string, data: RideCompletedPayload) {
        const { rideId, distance, fare } = data;

        // 1. Validate and update ride status
        const [rideErr, ride] = await safeAsync(() =>
            updateRideStatus(rideId, "completed")
        );
        if (rideErr) throw new Error(`Failed to update ride status: ${rideErr.message}`);
        if (!ride) throw new Error(`Ride ${rideId} not found`);

        // Sync driver store
        driverStore.upsert(driverId, { currentRideId: null });

        // 2. Update ride fields (endedAt, fare, distance)
        const [updateRideErr] = await safeAsync(() =>
            RideModel.findOneAndUpdate(
                { _id: rideId },
                {
                    endedAt: new Date(),
                    fare,
                    distanceTraveled: distance,
                }
            )
        );

        if (updateRideErr)
            throw new Error(
                `Failed to update ride details for ${rideId}: ${updateRideErr.message}`
            );

        const rideUpdte = await RideModel.findOne({ _id: rideId });
        console.log("🍫 RIDE COMPLETED", rideUpdte);

        // 3. Update driver in DB (clear currentRideId)
        const [updateDriverErr] = await safeAsync(() =>
            DriverModel.findOneAndUpdate({ _id: driverId }, { currentRideId: null })
        );
        if (updateDriverErr)
            throw new Error(
                `Failed to update driver ${driverId}: ${updateDriverErr.message}`
            );

        // 4. Deduct commission & update balance
        const [commissionErr, commissionResult] = await safeAsync(() =>
            handleRideCommission(driverId, rideId)
        );
        if (commissionErr)
            throw new Error(
                `Failed to process commission for ride ${rideId}: ${commissionErr.message}`
            );

        const { balance, commission } = commissionResult!;

        // 5. Notify driver
        socketIo.emit("balance_updated", {
            newBalance: balance,
            fare,
            commission,
            message: `💰 Ride completed! You earned ${balance.toFixed(
                0
            )} UZS after 12% commission.`,
        });

        // 6. Notify user (if online)
        const userSocketId = userSockets.get(ride.userChatId);
        if (userSocketId) {
            socketIo.to(userSocketId).emit("ride_completed", data);
        }
    }
};

