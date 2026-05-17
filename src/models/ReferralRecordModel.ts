import mongoose, { Schema } from "mongoose";

export type ReferralStatus = "pending_location" | "approved" | "rejected";
export type ReferredUserType = "passenger" | "driver";

const ReferralRecordSchema = new Schema(
    {
        referrerId: { type: Schema.Types.ObjectId, ref: "Driver", required: true, index: true },
        referredId:  { type: Schema.Types.ObjectId, required: true },
        referredUserType: { type: String, enum: ["passenger", "driver"], required: true },
        status: {
            type: String,
            enum: ["pending_location", "approved", "rejected"],
            default: "pending_location",
        },
        bonusAmount: { type: Number, default: 0 },
        // true once the referrer's referralBonus has actually been incremented
        // for this record. Used to make approve/reject idempotent and to know
        // whether a bonus must be reversed when an approval is overturned.
        bonusCredited: { type: Boolean, default: false },
        // true when the status was decided automatically by the zone-radius
        // check (vs. a manual admin override in the approvals page).
        autoVerified: { type: Boolean, default: false },
        referredLocation: {
            lat: { type: Number },
            lng: { type: Number },
        },
        verifiedAt: { type: Date },
    },
    { timestamps: true }
);

// One record per referred user (prevent duplicate records)
ReferralRecordSchema.index({ referredId: 1, referredUserType: 1 }, { unique: true });

export const ReferralRecordModel = mongoose.model("ReferralRecord", ReferralRecordSchema);
