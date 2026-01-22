// src/services/fareService.ts
import { fareConfigs } from "../data/fare.database";
import { FareConfig } from "../models/FareConfig";

export const getFareByCity = async (cityId: string, isPremium = false): Promise<FareConfig> => {
    const fare = fareConfigs[cityId] || fareConfigs["default"];

    if (!fare) {
        throw new Error("Fare not found");
    }

    if (isPremium && fare.premium) {
        // merge premium fares into base fare object
        return {
            ...fare,
            ...fare.premium,
        };
    }

    return fare;
};
