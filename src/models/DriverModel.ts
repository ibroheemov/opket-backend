import mongoose, { Schema, Document } from "mongoose";

export interface IDriverDocument extends Document {
    _id: string,
    firstname: string;
    lastname: string;
    name: string; // full name for display
    phone: string;
    carModel?: string;
    carColor?: string;
    carNumber?: string;
    regionCode?: string;
    vehicle: string; // derived string like "Toyota - ABC123"
    status: "offline" | "available" | "on_trip";
    location?: { lat: number; lon: number, bearing?: number };
    otp?: string;
    fcmToken?: string;
    otpExpiresAt?: Date;
    chatId?: number;
    currentRideId?: string;
    selfie?: string;
    driver_license?: string;
    passport?: string;
    balance: number;
    canReceiveOffers: boolean;
}

const DriverSchema = new Schema<IDriverDocument>(
    {
        firstname: { type: String, required: true },
        lastname: { type: String, required: true },
        name: { type: String, required: true },
        phone: { type: String, required: true, unique: true },
        balance: { type: Number, default: 500_000 },
        carModel: { type: String },
        carNumber: { type: String },
        regionCode: { type: String },
        carColor: { type: String },
        vehicle: { type: String },
        status: {
            type: String,
            enum: ["offline", "available", "on_trip"],
            default: "offline",
        },
        location: {
            lat: Number,
            lon: Number,
            bearing: Number,
        },
        fcmToken: { type: String },
        otp: String,
        otpExpiresAt: Date,
        chatId: Number,
        currentRideId: { type: String },
        selfie: { type: String },
        driver_license: { type: String },
        passport: { type: String },
        canReceiveOffers: { type: Boolean },

    },
    { timestamps: true }
);

export const DriverModel = mongoose.model<IDriverDocument>(
    "Driver",
    DriverSchema
);
