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
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({ error: "phone is required" });
        }

        let existing: IPassengerDocument | null = null;
        // Prevent duplicate phone registrations
        if (phone) {
            existing = await PassengerModel.findOne({ phone });
        }

        if (existing) {
            return res.json({ message: "User with this Chatid/phone already exists" });
        }

        const passenger = await PassengerModel.create({ phone });

        return res.json({ phone, message: "Passenger created" });
    } catch (err: any) {
        console.error("createUser error:", err);
        return res.status(500).json({ error: "Internal error" });
    }
};

// export const cancelRide = async (req: Request, res: Response) => {
//     try {
//         const { rideId } = req.body;
//         if (!rideId) {
//             return res.status(400).json({ error: "rideId required" });
//         }

//         const ride = await RideModel.findOneAndUpdate({ _id: rideId }, { status: 'cancelled' });

//         if (ride && ride.driverId) {
//             // await PassengerModel.updateOne(
//             //     { phone: ride.userPhoneNumber },
//             //     { $pull: { events: { event: "driver_location_update_ack" } } }
//             // );

//             // await DriverModel.findOneAndUpdate({ _id: ride.driverId }, { currentRideId: null });

//             driverStoreRedis.upsert(ride.driverId, { currentRideId: null });

//             emitToDriver(ride.driverId, "ride_cancelled", { rideId });
//         }

//         return res.json({ rideId, message: "Buyurtma bekor qilindi" });
//     } catch (err: unknown) {
//         if (err instanceof Error) {
//             // console.error("cancelRide error:", err.message, err.stack);
//             return res.status(500).json({ error: "Internal server error", details: err.message });
//         } else {
//             // console.error("cancelRide unknown error:");
//             return res.status(500).json({ error: "Internal server error" });
//         }
//     }
// };

export const cancelRide = async (req: Request, res: Response) => {
    try {
        const { rideId } = req.body;
        if (!rideId) {
            return res.status(400).json({ error: "rideId required" });
        }

        const rideKey = `ride:${rideId}`;
        const acceptKey = `ride_accept:${rideId}`;
        const cancelKey = `ride_cancel:${rideId}`;

        // 1️⃣ Fetch ride from Redis first (authoritative state)
        const rideData = await redis.hGetAll(rideKey);
        if (!rideData || Object.keys(rideData).length === 0) {
            return res.status(404).json({ error: `Ride ${rideId} not found` });
        }

        const driverId = rideData.driverId;

        // 2️⃣ Mark ride as cancelled in Redis
        await redis.hSet(rideKey, { status: "cancelled", phase: "cancelled" });
        await redis.set(cancelKey, "1", { EX: 60 }); // short TTL to signal cancellation
        await redis.del(acceptKey); // remove acceptance key

        // 3️⃣ Stop ongoing search if any
        if (RideService.stopSearching) {
            RideService.stopSearching(rideId);
        }

        // 4️⃣ Clear driver state (make driver available for new offers)
        if (driverId) {
            const driverKey = `driver:${driverId}`;
            await redis.hSet(driverKey, { currentRideId: "" });
            // Optional: also clear driver_offer key in case it exists
            await redis.del(`driver_offer:${driverId}`);
            emitToDriver(driverId, "ride_cancelled", { rideId });
        }

        // 5️⃣ Update ride status in MongoDB for history
        await RideModel.findOneAndUpdate(
            { _id: rideId },
            { status: "cancelled", endedAt: new Date() }
        );

        // 6️⃣ Notify passenger if online
        const userPhone = rideData.userPhoneNumber;
        if (userPhone) {
            emitToUser(Number(userPhone), "ride_cancelled", { rideId });
        }

        return res.json({ rideId, message: "Buyurtma bekor qilindi" });

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

        const ride = await RideModel.findOneAndUpdate({ _id: rideId }, { luggage: true });

        if (ride && ride.driverId) {
            emitToDriver(ride.driverId, "luggage_confirmed", {});
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
            emitToDriver(ride.driverId, "luggage_declined", {});
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
