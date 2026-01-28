import { emitToDriver } from "../gateway/ride.socket";
import { DriverModel } from "../models/DriverModel";
import { PassengerModel } from "../models/PassengerModel";
import { TransactionModel } from "../models/TransactionModel";
import admin from 'firebase-admin';

type PayfareInput = {
    phone: string | number;
    driverId: string;
    amount: number;
};

export async function payfareTransfer({ phone, driverId, amount }: PayfareInput) {
    const phoneStr = String(phone);

    // ✅ validations (includes max 5000)
    if (!phoneStr || !driverId || !Number.isFinite(amount) || amount <= 0 || amount > 5000) {
        return {
            ok: false as const,
            status: 400,
            message: "Invalid amount. Maximum allowed is 5000",
        };
    }

    // 1) Deduct passenger atomically
    const passenger = await PassengerModel.findOneAndUpdate(
        { phone: phoneStr, balance: { $gte: amount } },
        { $inc: { balance: -amount } },
        { new: true, projection: { balance: 1, currentRideId: 1 } }
    );

    if (!passenger) {
        return {
            ok: false as const,
            status: 400,
            message: "Hamyoningizda mablag' yetarli emas!",
        };
    }

    // 2) Credit driver
    const driver = await DriverModel.findByIdAndUpdate(
        driverId,
        { $inc: { balance: amount } },
        { new: true, projection: { balance: 1, fcmToken: 1 } }
    );

    if (!driver) {
        // rollback passenger
        await PassengerModel.updateOne({ phone: phoneStr }, { $inc: { balance: amount } });

        return {
            ok: false as const,
            status: 404,
            message: "Driver not found",
        };
    }

    // 3) Log transaction (non-blocking)
    if (passenger.currentRideId) {
        TransactionModel.create({
            rideId: passenger.currentRideId,
            fromUserId: passenger._id,
            toUserId: driver._id,
            amount,
            type: "passenger_to_driver",
        }).catch(console.error);
    }

    // 4) Notify driver (non-blocking)
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

    return {
        ok: true as const,
        status: 200,
        message: "Payment transferred successfully",
        passengerBalance: passenger.balance,
        driverBalance: driver.balance,
    };
}
