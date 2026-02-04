// src/controllers/fareController.ts
import { Request, Response } from "express";
import { getFareByCity } from "../services/fare.service";
import { AuthRequest } from "../middlewares/auth";
import { DriverModel } from "../models/DriverModel";
import { WorkingAreaService } from "../services/working.area.service";
import { driverStore } from "../store/driverStore";
import { driverStoreRedis } from "../store/driverStoreRedis";
import { emitToDriver } from "../gateway/ride.socket";
import admin from 'firebase-admin';
import { payfareTransfer } from "../services/payfare.service";

// import DriverModel from "../models/Driver"; // <- adjust path

export const generateQrLink = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.driverId; // carNumber like "T410OB"
        if (!driverId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized: driverId missing",
            });
        }

        const passengerPackage = process.env.PASSENGER_ANDROID_PACKAGE;
        if (!passengerPackage) {
            return res.status(500).json({
                success: false,
                message: "Server misconfigured: PASSENGER_ANDROID_PACKAGE not set",
            });
        }

        // Build Play Store install referrer payload
        // Keep it short and simple; you can add &area=... if you want later.
        const referrerPayload = `ref=${driverId}&src=driver_qr`;

        // Must be URL-encoded because it's nested inside another query param
        const encodedReferrer = encodeURIComponent(referrerPayload);

        const link =
            `https://play.google.com/store/apps/details` +
            `?id=${encodeURIComponent(passengerPackage)}` +
            `&referrer=${encodedReferrer}`;

        return res.json({
            success: true,
            link,
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to generate QR link",
        });
    }
};

export const deductFromUser = async (req: AuthRequest, res: Response) => {
    try {
        const { phone, amount } = req.body;
        const driverId = req.driverId;

        if (!driverId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized: driverId missing",
            });
        }

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

export const updateDriverBalance = async (driverId: string, amount: number) => {
    const updatedDriver = await DriverModel.findByIdAndUpdate(
        driverId,
        { $inc: { balance: amount, referrals: 1 } },
        { new: true }
    );

    emitToDriver(driverId, "balance_updated", { 'balance': updatedDriver?.balance });

    const fcmToken = updatedDriver?.fcmToken;
    if (!fcmToken) {
        return;
    }


    const message = {
        token: fcmToken,
        android: {
            priority: "high" as const,
        },
        data: {
            type: 'balance_updated',
            amount: amount.toString(),
            source: "Paynet",
            message: `Hisobingiz ${amount} UZS ga to'ldirildi.`
        },
    };

    try {
        await admin.messaging().send(message);
        return true;
    } catch (error) {
        return false;
    }
}


export const updateAppVersion = async (req: AuthRequest, res: Response) => {
    try {
        const { version } = req.body;
        const driverId = req.driverId;

        // 1️⃣ Validate input
        if (!version || typeof version !== "string") {
            return res.status(400).json({
                success: false,
                message: "app version is required",
            });
        }

        if (!driverId) {
            return res.status(401).json({
                success: false,
                message: "unauthorized",
            });
        }

        // 2️⃣ Update driver app version
        const updatedDriver = await DriverModel.findByIdAndUpdate(
            driverId,
            {
                appVersion: version,
                // appVersionUpdatedAt: new Date(), // optional but recommended
            },
            {
                new: true,
                runValidators: true,
            }
        );

        // 3️⃣ Handle not found
        if (!updatedDriver) {
            return res.status(404).json({
                success: false,
                message: "driver not found",
            });
        }

        // 4️⃣ Success response
        return res.status(200).json({
            success: true,
            message: "app version updated successfully",
            data: {
                driverId: updatedDriver._id,
                appVersion: updatedDriver.appVersion,
            },
        });
    } catch (error) {
        console.error("updateDriverBalance error:", error);

        return res.status(500).json({
            success: false,
            message: "internal server error",
        });
    }
};
