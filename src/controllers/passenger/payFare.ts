import { AuthRequest } from "../../middlewares/auth";
import { DriverModel } from "../../models/DriverModel";
import { Response } from "express";
import { PassengerModel } from "../../models/PassengerModel";
import { socketIo } from "../../gateway/socket2";
import { TransactionModel } from "../../models/TransactionModel";
import admin from 'firebase-admin';
import { emitToDriver } from "../../gateway/ride.socket";
import mongoose from "mongoose";

export const payfare = async (req: AuthRequest, res: Response) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const phone = req.params.id;
        const { driverId, amount } = req.body;

        if (!driverId || !phone || !amount || amount <= 0) {
            return res.status(400).json({ message: "Invalid input" });
        }

        const passenger = await PassengerModel.findOne({ phone }).session(session);
        if (!passenger) {
            return res.status(404).json({ message: "Passenger not found" });
        }

        if ((passenger.balance ?? 0) < amount) {
            return res.status(400).json({ message: "Hamyoningizda mablag' yetarli emas!" });
        }

        // Update balances in parallel
        const [updatedPassenger, updatedDriver] = await Promise.all([
            PassengerModel.findOneAndUpdate(
                { phone },
                { $inc: { balance: -amount } },
                { new: true, session }
            ),
            DriverModel.findByIdAndUpdate(
                driverId,
                { $inc: { balance: amount } },
                { new: true, session }
            ),
        ]);

        if (!updatedDriver) {
            throw new Error("Driver not found");
        }

        if (passenger.currentRideId) {
            await TransactionModel.create([{
                rideId: passenger.currentRideId,
                fromUserId: passenger._id,
                toUserId: updatedDriver._id,
                amount,
                type: "passenger_to_driver",
            }], { session });
        }

        await session.commitTransaction();
        session.endSession();

        // 🚀 Respond immediately
        res.json({
            success: true,
            message: "Payment transferred successfully",
            driverBalance: updatedDriver.balance,
            passengerBalance: updatedPassenger?.balance,
        });

        // 🔔 Send FCM AFTER response
        if (updatedDriver.fcmToken) {
            admin.messaging().send({
                token: updatedDriver.fcmToken,
                android: { priority: "high" },
                data: {
                    type: "balance_updated",
                    amount: amount.toString(),
                    message: `Hisobingiz ${amount} UZS ga to'ldirildi.`,
                },
            }).catch(console.error);
        }

        emitToDriver(driverId, "ride_change_confirmed", {});

    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};
