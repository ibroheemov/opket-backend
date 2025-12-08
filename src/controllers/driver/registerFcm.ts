import { AuthRequest } from "../../middlewares/auth";
import { DriverModel } from "../../models/DriverModel";
import { Response } from "express";

export const registerFcm = async (req: AuthRequest, res: Response) => {

    const { fcmToken } = req.body;
    const driverId = req.driverId;

    console.log(driverId, fcmToken);
    if (!driverId || !fcmToken) return res.sendStatus(400);

    await DriverModel.findByIdAndUpdate(driverId, { fcmToken });
    console.log(`💾 Updated FCM token for driver ${driverId}`);
    res.status(200).json({ "success": true });
};