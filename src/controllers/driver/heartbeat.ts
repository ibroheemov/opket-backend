import { AuthRequest } from "../../middlewares/auth";
import { Response } from "express";
import { driverLocationStore } from "../../store/driver.location.store";
import { DriverSocketLocationBody } from "../../types/driver.types";
import { driverSessionStore } from "../../store/driver.session.store";

export const heartbeat = async (req: AuthRequest, res: Response) => {
    const data: DriverSocketLocationBody = req.body;
    const driverId = req.driverId;

    console.log("📍HEARTBEAT", data);


    if (!driverId) {
        return res.status(400).json({ error: "driverId required" });
    }
    const session = await driverSessionStore.getCurrentSession(driverId);

    if (!session) {
        return res.status(400).json({ error: "Driver doesnt have active session" });

    }

    const geoType = session.tariff;

    driverLocationStore.updateLocation({
        ...data,
        driverId,
        geoType
    });

    return res.json({ ok: true });
};

