import { RideModel } from "../models/Ride";
import { RideRequestInput } from "../modules/ride/ride.types";
import { logger } from "../utils/logger";

export const RideRepository = {
    async createRide(data: RideRequestInput) {
        const { phone, chatId, location, dropoff, address, type, rideType } = data;

        const mongoData = {
            userChatId: chatId,
            userPhoneNumber: phone,
            pickup: { lat: location.lat, lon: location.lon, address },
            dropoff: dropoff
                ? { lat: dropoff.lat, lon: dropoff.lon, address: dropoff.address }
                : undefined,
            status: "pending",
            type,
            rideType,
        };

        try {
            return await RideModel.create(mongoData);
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
