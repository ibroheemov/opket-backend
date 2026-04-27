import mongoose, { Schema } from "mongoose";

const FareConfigSchema = new Schema(
    {
        type: {
            type: String,
            required: true,
            unique: true,
            enum: ["standard", "comfort", "ghost", "delivery"]
        },

        baseFare: { type: Number, required: true, default: 0 },
        perKm: { type: Number, required: true },
        firstKm: { type: Number, required: true },

        outsidePerKm: { type: Number, required: true },
        outsideFirstKm: { type: Number, required: true },

        perMinute: { type: Number, required: true },
        minutesBeforeCharge: { type: Number, required: true },

        smallestDistance: { type: Number, required: true },
        smallestDistanceFare: { type: Number, required: true },

        city: { type: String, default: "tashkent", index: true },
        isActive: { type: Boolean, default: true }
    },
    { timestamps: true }
);

FareConfigSchema.index({ type: 1 }, { unique: true });

export const FareConfigModel = mongoose.model(
    "FareConfig",
    FareConfigSchema
);