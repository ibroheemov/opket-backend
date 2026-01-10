// src/data/fareDatabase.ts
import { FareConfig } from "../models/FareConfig";

// Pretend DB table: fare per city (or vehicle type)
export const fareConfigs: Record<string, FareConfig> = {
    "default": {
        baseFare: 2000,
        perKm: 2200,
        firstKm: 5500,
        perMinute: 500,
        luggageEnabled: false,
        luggageCharge: 3000
    },

};
