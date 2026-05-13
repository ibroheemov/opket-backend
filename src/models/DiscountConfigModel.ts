import mongoose, { Schema } from "mongoose";

export type DiscountType = "percentage" | "fixed";

export interface IDiscountTier {
    minFare: number;          // inclusive
    maxFare: number | null;   // exclusive; null = no upper bound
    type: DiscountType;
    value: number;            // percentage: 0-100; fixed: UZS amount
}

const DiscountTierSchema = new Schema<IDiscountTier>(
    {
        minFare: { type: Number, required: true, default: 0, min: 0 },
        maxFare: { type: Number, default: null },
        type: { type: String, enum: ["percentage", "fixed"], required: true },
        value: { type: Number, required: true, min: 0 },
    },
    { _id: false }
);

const DiscountConfigSchema = new Schema(
    {
        enabled: { type: Boolean, default: false },
        tiers: { type: [DiscountTierSchema], default: [] },
    },
    { timestamps: true }
);

export const DiscountConfigModel = mongoose.model("DiscountConfig", DiscountConfigSchema);

/**
 * Returns the singleton discount config document, creating it if missing.
 */
export async function getDiscountConfig() {
    let doc = await DiscountConfigModel.findOne();
    if (!doc) doc = await DiscountConfigModel.create({ enabled: false, tiers: [] });
    return doc;
}

/**
 * Pure helper: given an original fare and a list of tiers, returns the
 * discount amount that applies (0 if no tier matches).
 *
 * A tier matches when `minFare <= fare < maxFare` (maxFare null = unbounded).
 * If multiple tiers match the first match wins, so callers should sort tiers
 * in the order they want them evaluated.
 */
export function computeDiscount(fare: number, tiers: IDiscountTier[]): number {
    if (!Number.isFinite(fare) || fare <= 0) return 0;
    for (const tier of tiers) {
        const aboveMin = fare >= (tier.minFare ?? 0);
        const belowMax = tier.maxFare == null || fare < tier.maxFare;
        if (aboveMin && belowMax) {
            const raw =
                tier.type === "percentage"
                    ? (fare * tier.value) / 100
                    : tier.value;
            return Math.max(0, Math.min(fare, Math.round(raw)));
        }
    }
    return 0;
}
