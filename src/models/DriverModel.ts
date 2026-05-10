import mongoose, { Schema, Document, Types } from "mongoose";
import { serviceIds, services } from "../data/fare.database";

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
    password?: string;
    appVersion?: string;

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
    referrals?: number;
    referralCode?: string;
    referralBonus: number;
    referredBy?: string;
    currentRideId?: string;

    // Uploads
    license_front?: IUploadMeta;
    license_back?: IUploadMeta;
    driver_photo?: IUploadMeta;
    documentsApproved: boolean;
    documentsRejected?: boolean;
    rejectionComment?: string;

    balance: number;
    commissionRate?: number;
    canReceiveOffers: boolean;
    blocked?: boolean;
    hasPremiumCar: boolean;

    events: {
        event: string;
        data: Record<string, any>;
    }[];
    enabledOptions?: string[];
    tariffs: Types.ObjectId[];
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
        appVersion: { type: String },

        phone: { type: String, required: true, unique: true, index: true },

        password: { type: String },
        balance: { type: Number, default: 0 },
        commissionRate: { type: Number },

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
        referrals: Number,
        referralCode: { type: String, unique: true, sparse: true },
        referralBonus: { type: Number, default: 0 },
        referredBy: { type: String },
        currentRideId: String,

        // Uploads
        license_front: { type: UploadSchema, default: () => ({ status: "NOT_PROVIDED" }) },
        license_back: { type: UploadSchema, default: () => ({ status: "NOT_PROVIDED" }) },
        driver_photo: { type: UploadSchema, default: () => ({ status: "NOT_PROVIDED" }) },
        documentsApproved: { type: Boolean, default: false },
        documentsRejected: { type: Boolean, default: false },
        rejectionComment: { type: String },

        canReceiveOffers: { type: Boolean, default: false },
        blocked: { type: Boolean, default: false },
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
        enabledOptions: { type: [String], default: [] },
        tariffs: {
            type: [
                {
                    type: Schema.Types.ObjectId,
                    ref: "FareConfig"
                }
            ],
            default: []
        },
    },
    { timestamps: true }
);

export const DriverModel = mongoose.model<IDriverDocument>(
    "Driver",
    DriverSchema
);
