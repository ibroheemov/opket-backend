import mongoose, { Schema, Document } from "mongoose";

export interface IRideSearchConfig extends Document {
    searchDurationMs: number;       // total ride search window in ms
    maxOffersPerDriver: number;     // max times one driver can be offered the same ride
    reofferAfterMs: number;         // cooldown before re-offering to a declined driver
    stage1RadiusKm: number;         // Stage 0: radius in km, batch of 3, full-screen offer
    stage1TtlMs: number;
    stage1BatchSize: number;
    stage2RadiusKm: number;         // Stage 1: radius in km, batch of 3, full-screen offer
    stage2TtlMs: number;
    stage2BatchSize: number;
    stage3RadiusKm: number;         // Stage 2: radius in km, all drivers, list widget
    stage3TtlMs: number;
    stage4RadiusKm: number;         // Stage 3: radius in km, all drivers, list widget (tier fallback)
    stage4TtlMs: number;
}

const RideSearchConfigSchema = new Schema<IRideSearchConfig>(
    {
        searchDurationMs: { type: Number, required: true, default: 3 * 60 * 1000 },
        maxOffersPerDriver: { type: Number, required: true, default: 2 },
        reofferAfterMs: { type: Number, required: true, default: 10_000 },
        stage1RadiusKm: { type: Number, required: true, default: 1 },
        stage1TtlMs: { type: Number, required: true, default: 9000 },
        stage1BatchSize: { type: Number, required: true, default: 3 },
        stage2RadiusKm: { type: Number, required: true, default: 1.5 },
        stage2TtlMs: { type: Number, required: true, default: 9000 },
        stage2BatchSize: { type: Number, required: true, default: 3 },
        stage3RadiusKm: { type: Number, required: true, default: 2 },
        stage3TtlMs: { type: Number, required: true, default: 15000 },
        stage4RadiusKm: { type: Number, required: true, default: 2 },
        stage4TtlMs: { type: Number, required: true, default: 25000 },
    },
    { timestamps: true }
);

export const RideSearchConfigModel = mongoose.model<IRideSearchConfig>(
    "RideSearchConfig",
    RideSearchConfigSchema
);

export const DEFAULT_RIDE_SEARCH_CONFIG: Omit<IRideSearchConfig, keyof Document> = {
    searchDurationMs: 3 * 60 * 1000,
    maxOffersPerDriver: 2,
    reofferAfterMs: 10_000,
    stage1RadiusKm: 1,
    stage1TtlMs: 9000,
    stage1BatchSize: 3,
    stage2RadiusKm: 1.5,
    stage2TtlMs: 9000,
    stage2BatchSize: 3,
    stage3RadiusKm: 2,
    stage3TtlMs: 15000,
    stage4RadiusKm: 2,
    stage4TtlMs: 25000,
} as any;
