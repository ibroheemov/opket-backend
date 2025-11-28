// src/controllers/userController.ts
import { Request, Response } from "express";
import { RideModel } from "../models/Ride";
import { DriverModel } from "../models/DriverModel";
import { driverStore } from "../store/driverStore";
import { socketIo } from "../gateway/socket2";
import { PassengerModel } from "../models/PassengerModel";


export const createPassenger = async (req: Request, res: Response) => {
    console.log(`LUGGAGE CONFIRMED}`)
    try {
        const { chatId } = req.body;
        if (!chatId) {
            return res.status(400).json({ error: "userChatId required" });
        }
        // Prevent duplicate phone registrations
        const existing = await PassengerModel.findOne({ chatId });
        if (existing) {
            return res.json({ message: "User with this Chatid already exists" });
        }

        const passenger = await PassengerModel.create({ chatId });

        return res.json({ chatId, message: "Passenger created" });
    } catch (err: any) {
        console.error("createUser error:", err);
        return res.status(500).json({ error: "Internal error" });
    }
};

export const cancelRide = async (req: Request, res: Response) => {
    console.log(`RIDE CANCELLED}`)
    try {
        const { rideId } = req.body;
        if (!rideId) {
            return res.status(400).json({ error: "rideId required" });
        }

        const ride = await RideModel.findOneAndUpdate({ _id: rideId }, { status: 'cancelled' });
        console.log(ride);
        console.log(ride?.driverId);

        if (ride && ride.driverId) {
            await DriverModel.findOneAndUpdate({ _id: ride.driverId }, { currentRideId: null });
            const driverSession = driverStore.get(ride.driverId);
            driverStore.upsert(ride.driverId, { currentRideId: null });
            socketIo.to(driverSession?.socketId!).emit("cancel_ride", { rideId });
        }

        return res.json({ rideId, message: "Buyurtma bekor qilindi" });
    } catch (err: any) {
        console.error("requestRide error:", err);
        return res.status(500).json({ error: "Internal error" });
    }
};

export const confirmLuggage = async (req: Request, res: Response) => {
    console.log(`LUGGAGE CONFIRMED}`)
    try {
        const { rideId } = req.body;
        if (!rideId) {
            return res.status(400).json({ error: "rideId required" });
        }

        const ride = await RideModel.findOneAndUpdate({ _id: rideId }, { luggage: true });

        if (ride && ride.driverId) {
            const driverSession = driverStore.get(ride.driverId);
            socketIo.to(driverSession?.socketId!).emit("luggage_confirmed", { rideId });
        }

        return res.json({ rideId, message: "Klient bagajni tasdiqladi!" });
    } catch (err: any) {
        console.error("requestRide error:", err);
        return res.status(500).json({ error: "Internal error" });
    }
};

export const declineLuggage = async (req: Request, res: Response) => {
    console.log(`LUGGAGE DECLINED}`)
    try {
        const { rideId } = req.body;
        if (!rideId) {
            return res.status(400).json({ error: "rideId required" });
        }

        const ride = await RideModel.findById(rideId);

        if (ride && ride.driverId) {
            const driverSession = driverStore.get(ride.driverId);
            socketIo.to(driverSession?.socketId!).emit("luggage_declined", { rideId });
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
