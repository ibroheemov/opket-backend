import { Request, Response } from "express";
import { RideModel } from "../models/Ride";
import { DriverModel } from "../models/DriverModel";
import { driverStore } from "../store/driverStore";
import { socketIo } from "../gateway/socket2";
import { IPassengerDocument, PassengerModel } from "../models/PassengerModel";
import { emitToDriver, emitToUser } from "../gateway/ride.socket";
import { driverStoreRedis } from "../store/driverStoreRedis";
import { redis } from "../redis/redisClient";
import { RideService } from "../services/ride.new.service";
import { updateDriverBalance } from "./driver.controller";
import { RideRepository } from "../repositories/ride.repository";
import { generateAccessToken, generateRefreshToken } from "../utils/jwt";
import { Types } from "mongoose";

export const createPassengerBot = async (req: Request, res: Response) => {
    try {
        const { chatId, phone } = req.body;
        console.log(chatId, phone);

        if (!chatId || !phone) {
            return res.status(400).json({ error: "userChatId/phone is required" });
        }

        let existing: IPassengerDocument | null = null;
        // Prevent duplicate phone registrations
        if (chatId) {
            existing = await PassengerModel.findOne({ chatId });
        }
        if (phone) {
            existing = await PassengerModel.findOneAndUpdate({ phone, chatId });
        }

        if (existing) {
            return res.json({ message: "User with this Chatid/phone already exists" });
        }

        const passenger = await PassengerModel.create({ chatId, phone });

        return res.json({ chatId, phone, message: "Passenger created" });
    } catch (err: any) {
        console.error("createUser error:", err);
        return res.status(500).json({ error: "Internal error" });
    }
};

export const createPassengerApp = async (req: Request, res: Response) => {
    try {
        const { phone, referralCode } = req.body;

        if (!phone) {
            return res.status(400).json({ error: "phone is required" });
        }

        let existing: IPassengerDocument | null = null;
        // Prevent duplicate phone registrations
        if (phone) {
            existing = await PassengerModel.findOne({ phone });
        }

        if (existing) {
            const accessToken = generateAccessToken({ id: existing._id, role: "CONSUMER" });
            const refreshToken = generateRefreshToken({ id: existing._id, role: "CONSUMER" });

            return res.status(200).json({ message: "User with this Chatid/phone already exists", accessToken, refreshToken });
        }

        const passenger = await PassengerModel.create({ phone });

        const accessToken = generateAccessToken({ id: passenger._id, role: "CONSUMER" });
        const refreshToken = generateRefreshToken({ id: passenger._id, role: "CONSUMER" });

        if (referralCode) {
            updateDriverBalance(referralCode, 0);
        }

        return res.json({ phone, accessToken, refreshToken });
    } catch (err: any) {
        console.error("createUser error:", err);
        return res.status(500).json({ error: "Internal error" });
    }
};


export const cancelRide = async (req: Request, res: Response) => {
    try {
        const { rideId } = req.body;
        if (!rideId) return res.status(400).json({ error: "rideId required" });

        // If stopSearching is async, await it too
        RideService.stopSearching(rideId);
        await RideService.clearDriverRideState(rideId, "ride_cancelled");
        await RideRepository.setRideStatus(rideId, "cancelled", { by: "user" });

        return res.json({ rideId, message: "Buyurtma bekor qilindi" });
    } catch (err: any) {
        const status = err?.statusCode ?? 500;
        const msg = status === 500 ? "Internal server error" : err.message;
        return res.status(status).json({ error: msg });
    }
};

export const skipRide = async (req: Request, res: Response) => {
    try {
        const { rideId } = req.body;
        if (!rideId) return res.status(400).json({ error: "rideId required" });

        const rideKey = `ride:${rideId}`;

        const rideData = await redis.hGetAll(rideKey);
        if (!rideData || Object.keys(rideData).length === 0) {
            return res.status(404).json({ error: `Ride ${rideId} not found` });
        }

        const driverId = rideData.driverId;

        // 4) Update Mongo for history (keep a log entry, but don’t end the ride if you’re re-queuing it)
        // If you set endedAt here, it will look "finished". Better: log a cancellation event instead.
        const driverObjectId = new Types.ObjectId(driverId);
        void RideRepository.setRideStatus(rideId, "skipped", { by: "driver", driverId: driverObjectId });

        // 6) Restart searching using ride data from Redis
        const pickup = { lat: Number(rideData.pickupLat), lon: Number(rideData.pickupLon) };
        const phone = rideData.userPhoneNumber ? Number(rideData.userPhoneNumber) : undefined;

        // If you store options in ride hash, pass them; otherwise []
        await RideService.restartSearching({ rideId, pickup, phone, options: [], driverId });

        await RideService.clearDriverRideState(rideId, "");

        return res.json({ rideId, message: "Driver cancelled, searching again..." });
    } catch (err: unknown) {
        if (err instanceof Error) {
            return res.status(500).json({ error: "Internal server error", details: err.message });
        }
        return res.status(500).json({ error: "Internal server error" });
    }
};


export const confirmLuggage = async (req: Request, res: Response) => {
    try {
        const { rideId } = req.body;
        if (!rideId) {
            return res.status(400).json({ error: "rideId required" });
        }

        const rideKey = `ride:${rideId}`;
        const rideData = await redis.hGetAll(rideKey);


        if (rideData.driverId) {
            emitToDriver(rideData.driverId, "luggage_confirmed", {});
        }

        return res.json({ rideId, message: "Klient bagajni tasdiqladi!" });
    } catch (err: any) {
        console.error("requestRide error:", err);
        return res.status(500).json({ error: "Internal error" });
    }
};

export const declineLuggage = async (req: Request, res: Response) => {
    try {
        const { rideId } = req.body;
        if (!rideId) {
            return res.status(400).json({ error: "rideId required" });
        }

        const rideKey = `ride:${rideId}`;
        const rideData = await redis.hGetAll(rideKey);

        if (rideData && rideData.driverId) {
            emitToDriver(rideData.driverId, "luggage_declined", {});
        }

        return res.json({ rideId, message: "Klient bagajni rad etdi!" });
    } catch (err: any) {
        console.error("requestRide error:", err);
        return res.status(500).json({ error: "Internal error" });
    }
};

// very simple fare estimate function (you can replace with real pricing)
function calculateEstimate(distanceKm: number): number {
    const baseFare = 3;
    const perKm = 1.5;
    return parseFloat((baseFare + distanceKm * perKm).toFixed(2));
}
