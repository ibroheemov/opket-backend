import mongoose, { Schema, Document } from "mongoose";

export interface IGhostRide extends Document {
    _id: string;
    driverId: string;
    fare: number;
    distanceTraveled: number,
    createdAt?: Date;
    options?: {
        id: string;
        charge: number;
    }[];
    pauseSeconds?: number;
}

const rideSchema = new Schema<IGhostRide>({
    driverId: { type: String },
    fare: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    distanceTraveled: { type: Number, default: 0 },
    pauseSeconds: { type: Number, default: 0 },
    options: {
        type: [
            {
                id: { type: String, required: true },
                charge: { type: Number, required: true },
            },
        ],
        default: [],
    },
});

export const GhostRideModel = mongoose.model<IGhostRide>("GhostRide", rideSchema);
