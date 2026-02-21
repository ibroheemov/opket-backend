// src/models/Ride.ts
import mongoose, { Schema, Document, ObjectId, Types } from "mongoose";

export type RideStatus =
    | string
    | "pending"
    | "offered"
    | "accepted"
    | "arrived"
    | "waiting_for_user"
    | "started"
    | "completed"
    | "cancelled";

export interface IRideStatusEvent {
    status: RideStatus;
    driverId?: Types.ObjectId,
    distKm?: number,
    at: Date;
    by?: "system" | "user" | "driver" | "admin";
    note?: string;
}

export interface IRide extends Document {
    _id: string;
    userId?: string;
    userPhoneNumber?: number;
    userChatId: number;                // Telegram chat id for the user
    driverId?: string | null;
    pickup: { lat: number; lon: number; address?: string };
    dropoff?: { lat: number; lon: number; address?: string };
    status: RideStatus;
    statusHistory: IRideStatusEvent[];
    fare: number;
    pauseSeconds?: number;
    fareEstimate?: number;
    distanceKm?: number;
    createdAt?: Date;
    startedAt?: Date;
    endedAt?: Date;
    luggage: boolean;
    type: string | "app" | "bot",
    rideType: string | "standard" | "premium" | "comfort";
    distanceTraveled: number,
    candidateDrivers: { driverId: string, distKm: number }[],
    offeredTo?: string;
    offerExpiresAt?: Date;
    lastLocation: {
        lat: Number,
        lon: Number,
    },
    options?: {
        id: string;
        charge: number;
    }[];
}

const rideSchema = new Schema<IRide>({
    userId: String,
    userChatId: Number,
    userPhoneNumber: Number,
    driverId: { type: String },
    luggage: { type: Boolean, default: false },
    pickup: {
        lat: Number,
        lon: Number,
        address: String,
    },
    dropoff: {
        lat: Number,
        lon: Number,
        address: String,
    },
    status: {
        type: String,
        enum: ["pending", "offered", "accepted", "arrived", "started", "completed", "cancelled"],
        default: "pending",
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
    type: {
        type: String,
        default: "app",
    },
    rideType: {
        type: String,
        default: "standard",
    },
    fare: { type: Number, default: 0 },
    pauseSeconds: { type: Number, default: 0 },
    fareEstimate: Number,
    distanceKm: Number,
    createdAt: { type: Date, default: Date.now },
    startedAt: Date,
    endedAt: Date,
    distanceTraveled: { type: Number, default: 0 },
    lastLocation: {
        lat: Number,
        lon: Number,
    },
    candidateDrivers: { type: [{ driverId: String, distKm: Number }], default: [] },
    offeredTo: String,
    offerExpiresAt: Date,
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

export const RideModel = mongoose.model<IRide>("Ride", rideSchema);
