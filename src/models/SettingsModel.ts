import mongoose, { Schema } from "mongoose";

const SettingsSchema = new Schema(
    {
        key: { type: String, required: true, default: "commission" },
        value: { type: Number, required: true },
    },
    { timestamps: true }
);

SettingsSchema.index({ type: 1 }, { unique: true });

export const SettingsModel = mongoose.model(
    "Settings",
    SettingsSchema
);