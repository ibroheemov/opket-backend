import { Request, Response } from "express";
import { RideService } from "../services/ride.service";
import { logger } from "../utils/logger";
import { IRide, RideModel } from "../models/Ride";
import { DriverModel, IDriverDocument } from "../models/DriverModel";
import { TransactionModel } from "../models/TransactionModel";
import { AuthRequest } from "../middlewares/auth";
import { socketIo } from "../gateway/socket.maps";
import { RideRepository } from "../repositories/ride.repository";
import { sendOfferToDrivers } from "../utils/sendOfferToNextDriver";

export const requestRide = async (req: Request, res: Response) => {
    console.log("RIDE REQUEST RECEIVED");

    try {
        const { phone, chatId, location, dropoff, address, type } = req.body;

        if (
            !location ||
            typeof location.lat !== "number" ||
            typeof location.lon !== "number"
        ) {
            return res.status(400).json({ error: "[location] is required or invalid location coordinates" });
        }

        if (!phone && !chatId) {
            return res.status(400).json({ error: "[phone] or [chatId] is required" });
        }

        const result = await RideService.requestRide({ phone, chatId, location, dropoff, address, type });
        return res.status(200).json(result);
    } catch (err) {
        logger.error("requestRide error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};



export const acceptRide = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const driverId = req.driverId;

        if (!driverId) {
            return res.status(400).json({ message: "driverId is required" });
        }

        await RideService.acceptRide(id, driverId);
        const ride = await RideModel.findById(id).lean();

        if (!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        return res.status(200).json({ message: "Driver accepted the ride" });
    } catch (err) {
        console.error('Error fetching current ride:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const completeRide = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.driverId;
        const { rideId, distance, fare } = req.body;

        if (!rideId || !distance || !fare) {
            return res.status(400).json({ message: "These are required [rideId, distance, fare]" });
        }

        if (!driverId) {
            return res.status(400).json({ message: "driverId is required" });
        }

        await RideService.completeRide(driverId, { rideId, distance, fare });

        return res.status(200).json({ message: "Ride completed successfully" });
    } catch (err) {
        console.error('Error completing current ride:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};


export const declineRide = async (req: AuthRequest, res: Response) => {
    try {
        const { rideId } = req.body;
        // Remove this driver from the candidate list
        const driverId = req.driverId; // depends on your auth logic

        if (!driverId) {
            return res.status(400).json({ message: "driverId is required" });
        }

        await RideRepository.pullDriverCandidate(rideId, driverId);

        // Clear if this driver is currently offeredTo
        await RideModel.findOneAndUpdate(
            { _id: rideId, offeredTo: driverId },
            { $unset: { offeredTo: "" }, $set: { offerExpiresAt: null } }
        );

        // Now schedule next driver immediately
        sendOfferToDrivers(rideId);

        return res.send({ success: true });
    } catch (err) {
        console.error('Error fetching current ride:', err);
        return res.status(500).json({ error: 'Internal server error' });
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