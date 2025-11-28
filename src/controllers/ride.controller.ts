import { Request, Response } from "express";
import { RideService } from "../services/ride.service";
import { logger } from "../utils/logger";
import { IRide, RideModel } from "../models/Ride";
import { DriverModel, IDriverDocument } from "../models/DriverModel";
import { TransactionModel } from "../models/TransactionModel";

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


export const currentRide = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // Find the ride and populate the driver with selected fields
        const ride = await RideModel.findById(id)
            .lean();

        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }

        const transactions = await TransactionModel.find({ rideId: ride._id })
            .sort({ createdAt: 1 });


        const driver = await DriverModel.findById(
            ride.driverId,
            "name phone carModel carColor carNumber selfie"
        ).lean();

        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }

        // Construct the response
        const result = {
            fare: ride.fare,
            driverId: ride.driverId,
            driver,
            transactions
        };

        return res.status(200).json(result);
    } catch (err) {
        console.error('Error fetching current ride:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};