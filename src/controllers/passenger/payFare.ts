import { AuthRequest } from "../../middlewares/auth";
import { DriverModel } from "../../models/DriverModel";
import { Response } from "express";
import { PassengerModel } from "../../models/PassengerModel";
import { socketIo } from "../../gateway/socket2";
import { TransactionModel } from "../../models/TransactionModel";
import admin from 'firebase-admin';

export const payfare = async (req: AuthRequest, res: Response) => {
    try {
        const phone = req.params.id;
        const { driverId, amount } = req.body;

        if (!driverId || !phone || !amount) {
            return res.status(400).json({ message: "driverId, chatId and amount are required" });
        }

        if (amount <= 0) {
            return res.status(400).json({ message: "Amount must be greater than zero" });
        }

        // 1. Fetch passenger to verify sufficient balance
        const passenger = await PassengerModel.findOneAndUpdate({ phone }).lean();
        if (!passenger) {
            return res.status(404).json({ message: "Passenger not found" });
        }

        if ((passenger.balance ?? 0) < amount) {
            return res.status(400).json({ message: "Hamyoningizda mablag' yetarli emas!" });
        }

        // 2. Update passenger (- amount)
        const updatedPassenger = await PassengerModel.findOneAndUpdate(
            { phone },
            { $inc: { balance: -amount } },
            { new: true }
        );

        // 3. Update driver (+ amount)
        const updatedDriver = await DriverModel.findByIdAndUpdate(
            driverId,
            { $inc: { balance: amount } },
            { new: true }
        );

        if (!updatedDriver) {
            // rollback passenger balance if passenger not found
            await PassengerModel.findOneAndUpdate({ phone }, {
                $inc: { balance: amount },
            });

            return res.status(404).json({
                message: "Driver not found, rolled back passenger balance",
            });
        }

        // 4. Save transaction
        if (passenger.currentRideId) {
            await TransactionModel.create({
                rideId: passenger.currentRideId,
                fromUserId: passenger._id,
                toUserId: updatedDriver._id,
                amount,
                type: "passenger_to_driver",
            });
        }

        const transactions = await TransactionModel.find({ rideId: passenger.currentRideId })
            .sort({ createdAt: 1 });

        socketIo.emit("pay_fare", { transactions });

        const fcmToken = updatedDriver.fcmToken;

        if (fcmToken) {
            const message = {
                token: fcmToken,
                android: {
                    priority: "high" as const,
                },
                data: {
                    type: 'balance_updated',
                    amount: amount.toString(),
                    source: ""
                },
            };

            try {
                await admin.messaging().send(message);
            } catch (error) {
                console.error(`❌ Error sending FCM to driver ${updatedDriver.id}:`, error);
            }

        }


        return res.json({
            success: true,
            message: "Payment transferred successfully",
            driverBalance: updatedDriver?.balance,
            passengerBalance: updatedPassenger?.balance,
        });

    } catch (err) {
        console.error("payChange error:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};