import mongoose, { Schema } from "mongoose";

export const SETTINGS_KEYS = {
    COMMISSION: "commission",
    CASHBACK: "cashback",
    DRIVER_REFERRAL_BONUS: "driver_referral_bonus",
    PASSENGER_REFERRAL_BONUS: "passenger_referral_bonus",
    REFERRAL_ZONE_LAT: "referral_zone_lat",
    REFERRAL_ZONE_LNG: "referral_zone_lng",
    REFERRAL_ZONE_RADIUS_KM: "referral_zone_radius_km",
} as const;

export type SettingsKey = typeof SETTINGS_KEYS[keyof typeof SETTINGS_KEYS];

const SettingsSchema = new Schema(
    {
        key: { type: String, required: true, unique: true },
        value: { type: Number, required: true },
    },
    { timestamps: true }
);

export const SettingsModel = mongoose.model("Settings", SettingsSchema);

// Drop stale index left from old schema definition (SettingsSchema.index({ type: 1 }, { unique: true }))
SettingsModel.collection.dropIndex("type_1").catch(() => {
    // Ignore — index doesn't exist or already dropped
});