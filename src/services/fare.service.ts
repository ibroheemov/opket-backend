// src/services/fareService.ts
import { fareConfigs } from "../data/fare.database";
import { FareConfig } from "../models/FareConfig";

export const getFareByCity = async (cityId: string): Promise<FareConfig> => {
    const fare = fareConfigs[cityId] || fareConfigs["default"];

    if (!fare) {
        throw new Error("Fare not found");
    }

    return fare;
};
