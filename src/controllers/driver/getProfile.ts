import { AuthRequest } from "../../middlewares/auth";
import { DriverModel } from "../../models/DriverModel";
import { Response } from "express";

export const getProfile = async (req: AuthRequest, res: Response) => {

    const driverId = req.params.id;
    if (!driverId) return res.sendStatus(400);

    const driver = await DriverModel.findById(driverId).lean();

    if (!driver) {
        return res.status(404).json({ message: "Driver not found" });
    }

    res.json({ driver });
};