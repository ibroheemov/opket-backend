import { AuthRequest } from "../../middlewares/auth";
import { DriverModel } from "../../models/DriverModel";
import { Response } from "express";
import { PassengerModel } from "../../models/PassengerModel";
import { socketIo } from "../../gateway/socket2";
import { TransactionModel } from "../../models/TransactionModel";
import admin from 'firebase-admin';
import { emitToDriver } from "../../gateway/ride.socket";

export const payfare = async (req: AuthRequest, res: Response) => {
    try {
        const phone = req.params.id;
        const { driverId, amount } = req.body;

        if (!phone || !driverId || !amount || amount <= 0) {
            return res.status(400).json({ message: "Invalid input" });
        }

        // 1️⃣ Atomically deduct passenger balance (fails if insufficient)
        const passenger = await PassengerModel.findOneAndUpdate(
            {
                phone,
                balance: { $gte: amount }, // ✅ prevents overdraft
            },
            {
                $inc: { balance: -amount },
            },
            {
                new: true,
                projection: { balance: 1, currentRideId: 1 }, // ✅ fetch only needed fields
            }
        );

        if (!passenger) {
            return res
                .status(400)
                .json({ message: "Hamyoningizda mablag' yetarli emas!" });
        }

        // 2️⃣ Credit driver balance
        const driver = await DriverModel.findByIdAndUpdate(
            driverId,
            { $inc: { balance: amount } },
            {
                new: true,
                projection: { balance: 1, fcmToken: 1 },
            }
        );

        if (!driver) {
            // ⚠️ Extremely rare, but rollback passenger just in case
            await PassengerModel.updateOne(
                { phone },
                { $inc: { balance: amount } }
            );

            return res.status(404).json({ message: "Driver not found" });
        }

        // 🚀 Respond immediately
        res.json({
            success: true,
            message: "Payment transferred successfully",
            passengerBalance: passenger.balance,
            driverBalance: driver.balance,
        });

        // 3️⃣ Log transaction (non-blocking)
        if (passenger.currentRideId) {
            TransactionModel.create({
                rideId: passenger.currentRideId,
                fromUserId: passenger._id,
                toUserId: driver._id,
                amount,
                type: "passenger_to_driver",
            }).catch(console.error);
        }

        // 4️⃣ Notify driver (non-blocking)
        if (driver.fcmToken) {
            admin
                .messaging()
                .send({
                    token: driver.fcmToken,
                    android: { priority: "high" },
                    data: {
                        type: "balance_updated",
                        amount: amount.toString(),
                        message: `Hisobingiz ${amount} UZS ga to'ldirildi.`,
                    },
                })
                .catch(console.error);
        }

        emitToDriver(driverId, "ride_change_confirmed", {});
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};
