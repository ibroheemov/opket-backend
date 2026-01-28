import { AuthRequest } from "../../middlewares/auth";
import { DriverModel } from "../../models/DriverModel";
import { Response } from "express";
import { PassengerModel } from "../../models/PassengerModel";
import { socketIo } from "../../gateway/socket2";
import { TransactionModel } from "../../models/TransactionModel";
import admin from 'firebase-admin';
import { emitToDriver } from "../../gateway/ride.socket";
import { payfareTransfer } from "../../services/payfare.service";

export const payfare = async (req: AuthRequest, res: Response) => {
    try {
        const phone = req.params.id;
        const { driverId, amount } = req.body;

        const result = await payfareTransfer({ phone, driverId, amount });

        return res.status(result.status).json(result.ok ? {
            success: true,
            message: result.message,
            passengerBalance: result.passengerBalance,
            driverBalance: result.driverBalance,
        } : { message: result.message });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};
