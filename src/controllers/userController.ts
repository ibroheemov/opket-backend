import { Request, Response } from "express";
import { RideModel } from "../models/Ride";
import { DriverModel } from "../models/DriverModel";
import { driverStore } from "../store/driverStore";
import { socketIo } from "../gateway/socket2";
import { IPassengerDocument, PassengerModel } from "../models/PassengerModel";
import { emitToDriver } from "../gateway/ride.socket";
import { driverStoreRedis } from "../store/driverStoreRedis";

export const createPassenger = async (req: Request, res: Response) => {
    try {
        const { chatId, phone } = req.body;

        if (!chatId) {
            return res.status(400).json({ error: "chatId is required" });
        }

        // 1️⃣ Find by chatId first
        const passenger = await PassengerModel.findOne({ chatId });

        // 2️⃣ If passenger exists
        if (passenger) {
            // If phone already exists → do nothing
            if (passenger.phone) {
                return res.json({
                    message: "Passenger already exists",
                    chatId: passenger.chatId,
                    phone: passenger.phone
                });
            }

            // 3️⃣ If passenger has NO phone → update it
            if (!phone) {
                return res.status(400).json({
                    error: "Phone is required to update existing passenger"
                });
            }

            // 4️⃣ Prevent phone collision
            const phoneExists = await PassengerModel.findOne({ phone });
            if (phoneExists) {
                return res.status(409).json({
                    error: "Phone already registered"
                });
            }

            passenger.phone = phone;
            await passenger.save();

            return res.json({
                message: "Passenger updated with phone",
                chatId,
                phone
            });
        }

        // 5️⃣ No passenger exists → create new
        if (!phone) {
            return res.status(400).json({
                error: "Phone is required to create passenger"
            });
        }

        const phoneExists = await PassengerModel.findOne({ phone });
        if (phoneExists) {
            return res.status(409).json({
                error: "Phone already registered"
            });
        }

        const newPassenger = await PassengerModel.create({ chatId, phone });

        return res.status(201).json({
            message: "Passenger created",
            chatId: newPassenger.chatId,
            phone: newPassenger.phone
        });

    } catch (err) {
        console.error("createPassenger error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};


export const cancelRide = async (req: Request, res: Response) => {
    try {
        const { rideId } = req.body;
        console.log("cancelRide:", rideId);

        if (!rideId) {
            return res.status(400).json({ error: "rideId required" });
        }

        const ride = await RideModel.findOneAndUpdate({ _id: rideId }, { status: 'cancelled' });

        if (ride && ride.driverId) {
            await PassengerModel.updateOne(
                { phone: ride.userPhoneNumber },
                { $pull: { events: { event: "driver_location_update_ack" } } }
            );

            await DriverModel.findOneAndUpdate({ _id: ride.driverId }, { currentRideId: null });
            // const driverSession = driverStoreRedis.get(ride.driverId);
            driverStoreRedis.upsert(ride.driverId, { currentRideId: null });


            emitToDriver(ride.driverId, "ride_cancelled", { rideId });
        }

        return res.json({ rideId, message: "Buyurtma bekor qilindi" });
    } catch (err: unknown) {
        if (err instanceof Error) {
            // console.error("cancelRide error:", err.message, err.stack);
            return res.status(500).json({ error: "Internal server error", details: err.message });
        } else {
            // console.error("cancelRide unknown error:");
            return res.status(500).json({ error: "Internal server error" });
        }
    }
};

export const confirmLuggage = async (req: Request, res: Response) => {
    try {
        const { rideId } = req.body;
        if (!rideId) {
            return res.status(400).json({ error: "rideId required" });
        }

        const ride = await RideModel.findOneAndUpdate({ _id: rideId }, { luggage: true });

        if (ride && ride.driverId) {
            const driverSession = await driverStoreRedis.get(ride.driverId);
            socketIo.to(driverSession?.socketId!).emit("luggage_confirmed", { rideId });
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

        const ride = await RideModel.findById(rideId);

        if (ride && ride.driverId) {
            const driverSession = await driverStoreRedis.get(ride.driverId);
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
