import mongoose, { Schema, Document } from "mongoose";

export interface ReferralZoneDocument extends Document {
    polygon: { lat: number; lng: number }[];
}

const PointSchema = new Schema({ lat: Number, lng: Number }, { _id: false });

const ReferralZoneSchema = new Schema<ReferralZoneDocument>(
    { polygon: { type: [PointSchema], default: [] } },
    { timestamps: true }
);

export const ReferralZoneModel = mongoose.model<ReferralZoneDocument>(
    "ReferralZone",
    ReferralZoneSchema
);
