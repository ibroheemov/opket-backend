import { AuthRequest } from "../../middlewares/auth";
import { Response } from "express";
import { driverStore } from "../../store/driverStore";
import { RideModel } from "../../models/Ride";
import { emitToUser } from "../../gateway/ride.socket";

export const heartbeat = async (req: AuthRequest, res: Response) => {
    const { location } = req.body;
    const { lat, lon, bearing } = location;
    const driverId = req.driverId;

    console.error("🟡📍♻️ DRIVER => LOCATION UPDATE [BACKGROUND}", driverId);


    if (!driverId) {
        return res.status(400).json({ error: "driverId required" });
    }

    driverStore.updateLocation(driverId, { lat, lon, bearing });
    const driverSession = driverStore.get(driverId);
    if (driverSession?.currentRideId) {
        const ride = await RideModel.findById(driverSession?.currentRideId);
        if (ride && ride.userPhoneNumber) {
            emitToUser(ride.userPhoneNumber, "driver_location_update", {
                driverId,
                location: { lat, lon, bearing },
                timestamp: Date.now(),
            })
        }
    }

    return res.json({ ok: true });
};