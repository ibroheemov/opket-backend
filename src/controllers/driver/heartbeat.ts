import { AuthRequest } from "../../middlewares/auth";
import { Response } from "express";
import { driverLocationStore } from "../../store/driver.location.store";
import { DriverSocketLocationBody } from "../../types/driver.types";
import { driverSessionStore } from "../../store/driver.session.store";
import { emitToUser } from "../../gateway/ride.socket";

export const heartbeat = async (req: AuthRequest, res: Response) => {
    const data: DriverSocketLocationBody = req.body;
    const driverId = req.driverId;
    console.log("heartbeat", driverId, data);

    if (!driverId) {
        return res.status(400).json({ error: "driverId required" });
    }
    const session = await driverSessionStore.getCurrentSession(driverId);

    if (!session) {
        return res.status(400).json({ error: "Driver doesnt have active session" });
    }

    console.log(session.userPhoneNumber);
    if (session.userPhoneNumber) {
        const emitted = emitToUser(session.userPhoneNumber, "driver:location", data);
        console.log(emitted);
    }

    const geoType = session.tariff;

    driverLocationStore.updateLocation({
        ...data,
        driverId,
        geoType
    });

    return res.json({ ok: true });
};

