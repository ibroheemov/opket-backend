import { Request, Response } from "express";
import { PassengerModel } from "../models/PassengerModel";

export const registerPassengerFcm = async (req: Request, res: Response) => {
    const { fcmToken } = req.body;
    const phone = req.params.phone;

    if (!phone || !fcmToken) return res.sendStatus(400);

    await PassengerModel.findOneAndUpdate({ phone }, { fcmToken });
    res.status(200).json({ "success": true });
};