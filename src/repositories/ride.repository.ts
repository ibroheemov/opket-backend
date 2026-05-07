import { Types } from "mongoose";
import { GhostRideModel } from "../models/GhostRide";
import { RideModel, RideStatus } from "../models/Ride";
import { GhostRideInput, RideRequestInput } from "../modules/ride/ride.types";
import { logger } from "../utils/logger";
import { CompleteGhostRideRequestBody } from "../types/driver.types";

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
        data?: Object,
    ) {
        if (rideId == "") return;
        const now = new Date();

        return RideModel.findOneAndUpdate(
            { _id: rideId },
            {
                $set: { status: newStatus, ...data },
                $push: { statusHistory: { status: newStatus, at: now, ...meta } },
            },
            { new: true }
        );
    },

    async createGostRide(data: CompleteGhostRideRequestBody) {
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
        const { phone, pickup, dropoff, address, rideType, passengerId, isDelivery, delivery } = data;

        const mongoData: Record<string, any> = {
            userPhoneNumber: phone,
            pickup: { lat: pickup.latitude, lon: pickup.longitude, address },
            dropoff: dropoff
                ? { lat: dropoff.latitude, lon: dropoff.longitude, address: dropoff.address }
                : undefined,
            rideType,
            passengerId,
        };

        if (isDelivery && delivery) {
            mongoData.isDelivery = true;
            mongoData.fare = delivery.pricing.deliveryFee;
            mongoData.orderId = delivery.orderId;
        }

        try {
            console.time("mongo:create");
            const ride = await RideModel.create(mongoData);
            console.timeEnd("mongo:create");
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
