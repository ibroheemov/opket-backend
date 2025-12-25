import { AuthRequest } from "../../middlewares/auth";
import { DriverModel } from "../../models/DriverModel";
import { Response } from "express";
import { PassengerModel } from "../../models/PassengerModel";
import { emitToUser } from "../../gateway/ride.socket";
import { TransactionModel } from "../../models/TransactionModel";
import { driverStore } from "../../store/driverStore";
import { socketIo } from "../../gateway/socket.maps";

export const payChange = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.driverId;
        const { phone, amount } = req.body;

        if (!driverId || !phone || !amount) {
            return res.status(400).json({ message: "driverId, phone and amount are required" });
        }

        if (amount <= 0) {
            return res.status(400).json({ message: "Amount must be greater than zero" });
        }

        // 1. Fetch driver to verify sufficient balance
        const driver = await DriverModel.findById(driverId).lean();
        if (!driver) {
            return res.status(404).json({ message: "Driver not found" });
        }

        if ((driver.balance ?? 0) < amount) {
            return res.status(400).json({ message: "Driver does not have enough balance" });
        }

        // 2. Update driver (- amount)
        const updatedDriver = await DriverModel.findByIdAndUpdate(
            driverId,
            { $inc: { balance: -amount } },
            { new: true }
        );

        // 3. Update passenger (+ amount)
        const updatedPassenger = await PassengerModel.findOneAndUpdate(
            { phone },
            { $inc: { balance: amount } },
            { new: true }
        );

        if (!updatedPassenger) {
            // rollback driver balance if passenger not found
            await DriverModel.findByIdAndUpdate(driverId, {
                $inc: { balance: amount },
            });

            return res.status(404).json({
                message: "Passenger not found, rolled back driver balance",
            });
        }

        // 4. Save transaction
        if (updatedPassenger.currentRideId) {
            await TransactionModel.create({
                rideId: updatedPassenger.currentRideId,
                fromUserId: updatedDriver?._id,
                toUserId: updatedPassenger._id,
                amount,
                type: "driver_to_passenger",
            });
        }

        const transactions = await TransactionModel.find({ rideId: updatedPassenger.currentRideId })
            .sort({ createdAt: 1 });

        emitToUser(updatedPassenger.phone, "balance_top_up", { amount, passengerBalance: updatedPassenger.balance, driverId });
        const driverSession = driverStore.get(driverId);
        socketIo.to(driverSession?.socketId!).emit("pay_change", { transactions });

        return res.json({
            success: true,
            message: "Payment transferred successfully",
            driverBalance: updatedDriver?.balance,
            passengerBalance: updatedPassenger.balance,
        });

    } catch (err) {
        console.error("payChange error:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};