import { Request, Response } from "express";
import { PassengerModel } from "../../models/PassengerModel";

export const getMyReferralCode = async (req: Request, res: Response) => {
    try {
        const passengerId = (req as any).user?.id;
        if (!passengerId) return res.status(401).json({ ok: false, message: "Unauthorized" });

        const passenger = await PassengerModel.findById(passengerId).select("referralCode");
        if (!passenger) return res.status(404).json({ ok: false, message: "Passenger not found" });

        return res.json({ ok: true, referralCode: passenger.referralCode ?? null });
    } catch (err: any) {
        return res.status(500).json({ ok: false, message: err?.message ?? "Server error" });
    }
};
