import { PassengerModel } from "../../models/PassengerModel";
import { Request, Response } from "express";

export const getPassengerBalance = async (req: Request, res: Response) => {
    try {
        const phone = req.params.id;

        const passenger = await PassengerModel.findOne({ phone }).select("balance");
        if (!passenger) {
            return res.status(404).json({ message: "Passenger not found" });
        }

        return res.json({ balance: passenger.balance || 0 });
    } catch (error) {
        console.error("Error getting passenger balance:", error);
        res.status(500).json({ message: "Server error" });
    }
};