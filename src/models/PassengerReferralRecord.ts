import mongoose, { Schema } from "mongoose";

export type PassengerReferralStatus = "pending_location" | "approved" | "rejected";

const PassengerReferralRecordSchema = new Schema(
    {
        referrerId:    { type: Schema.Types.ObjectId, ref: "Passenger", required: true, index: true },
        referredId:    { type: Schema.Types.ObjectId, ref: "Passenger", required: true },
        referredPhone: { type: Number, required: true },
        bonusAmount:   { type: Number, default: 0 },
        status:        {
            type: String,
            enum: ["pending_location", "approved", "rejected"],
            default: "pending_location",
        },
        rejectionReason:  { type: String, default: null },
        referredLocation: { lat: { type: Number }, lng: { type: Number } },
    },
    { timestamps: true }
);

PassengerReferralRecordSchema.index(
    { referrerId: 1, referredId: 1 },
    { unique: true }
);

export const PassengerReferralRecord = mongoose.model(
    "PassengerReferralRecord",
    PassengerReferralRecordSchema
);
