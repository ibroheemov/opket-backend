import mongoose, { Schema } from "mongoose";

export type ReferralStatus = "pending_location" | "approved" | "out_of_range";
export type ReferredUserType = "passenger" | "driver";

const ReferralRecordSchema = new Schema(
    {
        referrerId: { type: Schema.Types.ObjectId, ref: "Driver", required: true, index: true },
        referredId:  { type: Schema.Types.ObjectId, required: true },
        referredUserType: { type: String, enum: ["passenger", "driver"], required: true },
        status: {
            type: String,
            enum: ["pending_location", "approved", "out_of_range"],
            default: "pending_location",
        },
        bonusAmount: { type: Number, default: 0 },
        verifiedAt: { type: Date },
    },
    { timestamps: true }
);

// One record per referred user (prevent duplicate records)
ReferralRecordSchema.index({ referredId: 1, referredUserType: 1 }, { unique: true });

export const ReferralRecordModel = mongoose.model("ReferralRecord", ReferralRecordSchema);
