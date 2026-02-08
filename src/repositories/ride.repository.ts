import { Types } from "mongoose";
import { GhostRideModel } from "../models/GhostRide";
import { RideModel, RideStatus } from "../models/Ride";
import { GhostRideInput, RideRequestInput } from "../modules/ride/ride.types";
import { logger } from "../utils/logger";

export const RideRepository = {
    async setRideStatus(
        rideId: string,
        newStatus: RideStatus,
        meta?: {
            by?: "system" | "user" | "driver" | "admin";
            note?: string,
            driverId?: Types.ObjectId;
            distKm?: number;
        },
    ) {
        if (rideId == "") return;
        const now = new Date();

        return RideModel.findOneAndUpdate(
            { _id: rideId },
            {
                $set: { status: newStatus },
                $push: { statusHistory: { status: newStatus, at: now, ...meta } },
            },
            { new: true }
        );
    },

    async createGostRide(data: GhostRideInput) {
        try {
            const ride = await GhostRideModel.create(data);
            return ride;
        } catch (err: any) {
            logger.error("Failed to create ride", {
                error: err,
                data,
            });

            throw new Error("RIDE_CREATE_FAILED");
        }
    },

    async createRide(data: RideRequestInput) {
        const { phone, chatId, location, dropoff, address, type, rideType } = data;

        const mongoData = {
            userChatId: chatId,
            userPhoneNumber: phone,
            pickup: { lat: location.lat, lon: location.lon, address },
            dropoff: dropoff
                ? { lat: dropoff.lat, lon: dropoff.lon, address: dropoff.address }
                : undefined,
            type,
            rideType,
        };

        try {
            const ride = await RideModel.create(mongoData);
            this.setRideStatus(ride.id, "pending", { by: "system" });

            return ride;
        } catch (err: any) {
            logger.error("Failed to create ride", {
                error: err,
                data,
            });

            throw new Error("RIDE_CREATE_FAILED");
        }
    },

    async updateRide(id: string, updates: Partial<any>) {
        return RideModel.findByIdAndUpdate(id, updates, { new: true }).catch((err) => {
            logger.error("RideModel update failed:", err);
        });
    },

    pullDriverCandidate(rideId: string, driverId: string) {
        return RideModel.findByIdAndUpdate(
            rideId,
            { $pull: { candidateDrivers: { driverId } } }
        );
    }
};
