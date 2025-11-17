import { Request, Response } from "express";
import { RideService } from "../services/ride.service";
import { logger } from "../utils/logger";

export const requestRide = async (req: Request, res: Response) => {
    logger.info("🚗 Ride request received");

    try {
        const { chatId, location, dropoff, address } = req.body;

        if (
            !chatId ||
            !location ||
            typeof location.lat !== "number" ||
            typeof location.lon !== "number"
        ) {
            return res.status(400).json({ error: "Invalid request body" });
        }

        const result = await RideService.requestRide({ chatId, location, dropoff, address });
        return res.status(200).json(result);
    } catch (err) {
        logger.error("requestRide error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};
