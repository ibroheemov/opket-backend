import mongoose, { Schema, Document } from "mongoose";

export type DriverStatus = "offline" | "available" | "on_trip";

export type UploadStatus =
    | "NOT_PROVIDED"
    | "PENDING_UPLOAD"
    | "UPLOADED"
    | "UPLOAD_FAILED";

export interface IUploadMeta {
    url?: string;
    publicId?: string;
    status: UploadStatus;
}


export interface IDriverDocument extends Document {
    _id: string;

    firstname: string;
    lastname: string;
    name: string;
    phone: string;

    carModel?: string;
    carColor?: string;
    carNumber?: string;
    regionCode?: string;
    vehicle: string;

    status: DriverStatus;

    location?: {
        lat: number;
        lon: number;
        bearing?: number;
    };

    otp?: string;
    otpExpiresAt?: Date;
    fcmToken?: string;
    chatId?: number;
    currentRideId?: string;

    // Uploads (refactored)
    selfie?: IUploadMeta;
    driver_license?: IUploadMeta;
    passport?: IUploadMeta;

    balance: number;
    canReceiveOffers: boolean;
    hasPremiumCar: boolean;

    events: {
        event: string;
        data: Record<string, any>;
    }[];
}


const UploadSchema = new Schema<IUploadMeta>(
    {
        url: { type: String },
        publicId: { type: String },
        status: {
            type: String,
            enum: ["NOT_PROVIDED", "PENDING_UPLOAD", "UPLOADED", "UPLOAD_FAILED"],
            default: "NOT_PROVIDED",
        },
    },
    { _id: false }
);

const DriverSchema = new Schema<IDriverDocument>(
    {
        firstname: { type: String, required: true },
        lastname: { type: String, required: true },
        name: { type: String, required: true },

        phone: { type: String, required: true, unique: true, index: true },

        balance: { type: Number, default: 40_000 },

        carModel: String,
        carNumber: String,
        regionCode: String,
        carColor: String,
        vehicle: String,

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

        fcmToken: String,
        otp: String,
        otpExpiresAt: Date,
        chatId: Number,
        currentRideId: String,

        // Uploads
        selfie: { type: UploadSchema, default: () => ({}) },
        driver_license: { type: UploadSchema, default: () => ({}) },
        passport: { type: UploadSchema, default: () => ({}) },

        canReceiveOffers: { type: Boolean, default: true },
        hasPremiumCar: { type: Boolean, default: false },

        events: {
            type: [
                {
                    event: { type: String, required: true },
                    data: { type: Schema.Types.Mixed, required: true },
                },
            ],
            default: [],
        },
    },
    { timestamps: true }
);

export const DriverModel = mongoose.model<IDriverDocument>(
    "Driver",
    DriverSchema
);
