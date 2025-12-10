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
import { emitToUser, updateRideStatus } from "../gateway/ride.socket";
import { handleRideCommission } from "../utils/fare.helper";
import { PassengerModel } from "../models/PassengerModel";
import { getSession } from "../bot/services/sessionManager";

type SearchResult = {
    drivers: any[] | 0; // replace `any` with your actual driver type
    message: string;
};

export interface RideRequestInput {
    chatId: number;
    location: { lat: number; lon: number };
    dropoff?: { lat: number; lon: number; address?: string };
    address?: string;
}

export interface RideOfferPaylod {
    id: string;
    pickup: DriverLocation;
    userPhoneNumber?: string;
    userChatId: number;
    travelDistance: string;
    travelTime: number;
    fcmToken: string | undefined;
    driverId: string;
}


export const RideService = {
    async searchForDriversFor3Minutes(
        rideId: string,
        pickup: { lat: number; lon: number },
        chatId: number,
    ): Promise<SearchResult> { // <- explicitly type the promise
        const MAX_DURATION = 1 * 60 * 1000; // 3 minutes
        const INTERVAL = 5000; // 5 seconds
        const start = Date.now();

        return new Promise<SearchResult>(async (resolve) => {
            let stopped = false;

            const checkDrivers = async () => {
                if (stopped) return;

                const elapsed = Date.now() - start;

                // 1) Stop if timeout
                if (elapsed >= MAX_DURATION) {
                    stopped = true;
                    await RideRepository.updateRide(rideId, { status: "cancelled" });
                    emitToUser(chatId, "ride_no_drivers", null);

                    return resolve({ drivers: 0, message: "No drivers found after 3 minutes" });
                }

                // 2) Check for drivers
                const drivers = await DriverRepository.findAvailableDrivers(pickup.lat, pickup.lon);

                if (drivers.length > 0) {
                    stopped = true;

                    const nearest = drivers[0];

                    await RideRepository.updateRide(rideId, {
                        candidateDrivers: drivers.map(d => ({
                            driverId: d.driver.driverId,
                            distKm: d.distKm
                        })),
                        driverId: nearest.driver.driverId
                    });

                    sendOfferToNextDriverSafe(rideId);

                    return resolve({
                        drivers,
                        message: "Driver found!",
                    });
                }
            };

            // First immediate check
            await checkDrivers();

            // Then interval checks every 5 seconds
            const interval = setInterval(async () => {
                if (stopped) {
                    clearInterval(interval);
                    return;
                }
                await checkDrivers();
            }, INTERVAL);
        });
    },


    async requestRide(input: RideRequestInput) {
        const { chatId, location, dropoff, address } = input;
        const session = getSession(chatId);
        console.log("USER PHONE: ", session.phone);

        // 1) Create initial ride
        const ride = await RideRepository.createRide({
            userChatId: chatId,
            userPhoneNumber: session.phone,
            pickup: { lat: location.lat, lon: location.lon, address },
            dropoff: dropoff
                ? { lat: dropoff.lat, lon: dropoff.lon, address: dropoff.address }
                : undefined,
            status: "pending",
        });

        // 2) Begin search loop for up to 3 minutes
        this.searchForDriversFor3Minutes(ride._id, location, chatId)
            .catch(err => console.error("Background search failed:", err));

        return {
            rideId: ride._id
        };
    },

    async acceptRide(
        rideId: string,
        driverId: string,
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
        socketIo.emit("ride_status", {
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
        // socketIo.emit("balance_updated", {
        //     newBalance: balance,
        //     fare,
        //     commission,
        //     message: `💰 Ride completed! You earned ${balance.toFixed(
        //         0
        //     )} UZS after 12% commission.`,
        // });

        // 6. Notify user (if online)
        const userSocketId = userSockets.get(ride.userChatId);
        if (userSocketId) {
            socketIo.to(userSocketId).emit("ride_completed", data);
        }
    }
};

