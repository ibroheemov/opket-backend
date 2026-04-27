import { AuthRequest } from "../../middlewares/auth";
import { Response } from "express";
import { driverLocationStore } from "../../store/driver.location.store";
import { DriverModel } from "../../models/DriverModel";
import { DriverSocketLocationBody } from "../../types/driver.types";

export const heartbeat = async (req: AuthRequest, res: Response) => {
    const data: DriverSocketLocationBody = req.body;
    const driverId = req.driverId;

    console.log("📍HEARTBEAT", data);


    if (!driverId) {
        return res.status(400).json({ error: "driverId required" });
    }

    const driver = await DriverModel.findById(driverId)
        .populate("tariffs");

    const geoType = getHighestRatedTariffType(driver);

    driverLocationStore.updateLocation({
        ...data,
        driverId,
        geoType
    });

    return res.json({ ok: true });
};

function getHighestRatedTariffType(driver: any): string {
    if (!driver.tariffs?.length) {
        return "standard";
    }

    const highestTariff = driver.tariffs.reduce(
        (best: any, current: any) =>
            current.rating > best.rating ? current : best
    );

    return highestTariff.type || "standard";
}