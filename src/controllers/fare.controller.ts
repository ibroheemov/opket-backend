// src/controllers/fareController.ts
import { Request, Response } from "express";
import { getFareByCity } from "../services/fare.service";

export const fetchFareConfig = async (req: Request, res: Response) => {
    try {
        const cityId = req.params.cityId || "default";

        const fare = await getFareByCity(cityId);

        return res.json({
            success: true,
            fare,
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch fare configuration",
        });
    }
};
