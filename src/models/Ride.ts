// src/models/Ride.ts
import mongoose, { Schema, Document } from "mongoose";

export interface IRide extends Document {
    _id: string;
    userId?: string;
    userPhoneNumber?: number;
    userChatId: number;                // Telegram chat id for the user
    driverId?: string | null;
    pickup: { lat: number; lon: number; address?: string };
    dropoff?: { lat: number; lon: number; address?: string };
    status: string | "pending" | "offered" | "accepted" | "arrived" | "waiting_for_user" | "started" | "completed" | "cancelled";
    fare: number;
    fareEstimate?: number;
    distanceKm?: number;
    createdAt?: Date;
    startedAt?: Date;
    endedAt?: Date;
    luggage: boolean;
    type: string | "app" | "bot",
    distanceTraveled: number,
    candidateDrivers: { driverId: string, distKm: number }[],
    offeredTo?: string;
    offerExpiresAt?: Date;
    lastLocation: {
        lat: Number,
        lon: Number,
    },
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
    type: {
        type: String,
        default: "app",
    },
    fare: { type: Number, default: 2000 },
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
});

export const RideModel = mongoose.model<IRide>("Ride", rideSchema);
