import { AuthRequest } from "../../middlewares/auth";
import { Response } from "express";
import { driverStore } from "../../store/driverStore";
import { RideModel } from "../../models/Ride";
import { emitToUser } from "../../gateway/ride.socket";
import { driverStoreRedis } from "../../store/driverStoreRedis";

import mongoose from "mongoose";

export const heartbeat = async (req: AuthRequest, res: Response) => {
    const { location } = req.body;
    const { lat, lon, bearing } = location;
    const driverId = req.driverId;

    if (!driverId) {
        return res.status(400).json({ error: "driverId required" });
    }
    await driverStoreRedis.updateLocation(driverId, { lat, lon, bearing });

    const driverSession = await driverStoreRedis.get(driverId);
    const rideId = driverSession?.currentRideId;

    if (!rideId || !mongoose.Types.ObjectId.isValid(rideId)) {
        return res.json({ ok: true });
    }

    try {
        const ride = await RideModel.findById(rideId);

        if (ride?.userPhoneNumber) {
            emitToUser(ride.userPhoneNumber, "driver_location_update", {
                driverId,
                location: { lat, lon, bearing },
                timestamp: Date.now(),
            });
        }
    } catch (err) {
        console.error("Heartbeat ride lookup failed:", err);
    }

    return res.json({ ok: true });
};
