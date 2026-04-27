// src/services/fareService.ts
import { fareConfigs, fareConfigsNew } from "../data/fare.database";
// import { FareConfig, FareConfigNew } from "../models/FareConfig";

export interface FareParamsType {
    isPremium: boolean;
    // cityId: string;
    carType: string;
}


export const getFareByCity = async (cityId: string, isPremium = false): Promise<any> => {
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


export const getFareByCityNew = async (rideType: string): Promise<any> => {
    const fare = fareConfigsNew[rideType];

    if (!fare) {
        throw new Error("Fare not found");
    }

    return fare;
};