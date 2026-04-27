import mongoose, { Schema, Document } from "mongoose";
import { IRideStatusEvent } from "./Ride";

export interface IGhostRide extends Document {
    _id: string;
    driverId: Schema.Types.ObjectId;
    fare?: number;
    status?: string;
    commission?: number;
    distanceTraveled?: number,
    createdAt?: Date;
    options?: {
        id: string;
        charge: number;
    }[];
    rideType?: string | "ghost";
    pauseSeconds?: number;
    statusHistory: IRideStatusEvent[];
}

const rideSchema = new Schema<IGhostRide>({
    driverId: { type: Schema.Types.ObjectId },
    fare: { type: Number, default: 0 },
    rideType: { type: String, default: "ghost" },
    status: { type: String },
    commission: { type: Number },
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
    statusHistory: {
        type: [
            {
                status: { type: String, required: true },
                driverId: { type: Schema.Types.ObjectId, ref: "Driver", required: false },
                distKm: { type: Number, required: false },
                at: { type: Date, required: true, default: Date.now },
                by: { type: String },   // optional
                note: { type: String }, // optional
            },
        ],
        default: [],
    },
});

export const GhostRideModel = mongoose.model<IGhostRide>("GhostRide", rideSchema);
