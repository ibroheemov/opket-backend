import { AuthRequest } from "../middlewares/auth";
import { getFareByCity } from "../services/fare.service";
import { Request, Response } from "express";

export const fetchFareConfigUser = async (req: Request, res: Response) => {
    try {
        const cityId = req.params.cityId || "default";

        const farePremium = await getFareByCity(cityId, true);
        const fare = await getFareByCity(cityId);

        return res.json({
            success: true,
            fare,
            farePremium
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch fare configuration",
        });
    }
};