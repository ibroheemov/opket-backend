import { RideModel } from "../models/Ride";
import { logger } from "../utils/logger";

export const RideRepository = {
    async createRide(data: any) {
        return RideModel.create(data);
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
