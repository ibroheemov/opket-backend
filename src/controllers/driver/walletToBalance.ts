import { AuthRequest } from "../../middlewares/auth";
import { DriverModel } from "../../models/DriverModel";
import { Response } from "express";

export const walletToBalance = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.driverId;
        const { amount } = req.body;

        if (!driverId || !amount) {
            return res.status(400).json({ message: "amount is required" });
        }

        if (amount <= 0) {
            return res.status(400).json({ message: "Amount must be greater than zero" });
        }

        const driver = await DriverModel.findOneAndUpdate(
            { _id: driverId, wallet: { $gte: amount } },
            { $inc: { wallet: -amount, balance: amount } },
            { new: true }
        );

        if (!driver) {
            return res.status(400).json({ message: "Insufficient wallet balance or driver not found" });
        }

        return res.json({
            success: true,
            balance: driver.balance,
            wallet: driver.wallet,
        });

    } catch (err) {
        console.error("walletToBalance error:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};
