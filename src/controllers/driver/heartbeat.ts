import { AuthRequest } from "../../middlewares/auth";
import { DriverModel } from "../../models/DriverModel";
import { Response } from "express";
import { driverStore } from "../../store/driverStore";

export const heartbeat = async (req: AuthRequest, res: Response) => {

    const { location } = req.body;
    const driverId = req.driverId;

    if (!driverId) {
        return res.status(400).json({ error: "driverId required" });
    }

    driverStore.upsert(driverId, {
        status: "online",
        location,
        lastUpdated: Date.now(),
    });

    console.log(`🔆 Driver[BG] ${driverId} location updated: ${location.lat}, ${location.lon}`);
    return res.json({ ok: true });
};