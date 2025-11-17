import express from "express";
import { RequestRide } from "../usecases/RequestRide";
import { ConfirmRide } from "../usecases/ConfirmRide";
import { UpdateDriverLocation } from "../usecases/UpdateDriverLocation";

export function createTaxiRouter(requestRide: RequestRide, confirmRide: ConfirmRide, updateDriverLocation: UpdateDriverLocation) {
    const router = express.Router();

    // user starts and shares location
    router.post("/request", async (req, res) => {
        const { userId, pickup } = req.body;
        const result = await requestRide.execute(userId, pickup);
        res.json(result);
    });

    // user confirms the chosen driver
    router.post("/confirm", async (req, res) => {
        const { rideId, driverId } = req.body;
        const ride = await confirmRide.execute(rideId, driverId);
        res.json(ride);
    });

    // driver app posts live location
    router.post("/driver/location", async (req, res) => {
        const { driverId, location } = req.body;
        await updateDriverLocation.execute(driverId, location);
        res.json({ ok: true });
    });

    return router;
}
