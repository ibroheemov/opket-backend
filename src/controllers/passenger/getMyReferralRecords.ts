import { Request, Response } from "express";
import { PassengerReferralRecord } from "../../models/PassengerReferralRecord";

export const getMyReferralRecords = async (req: Request, res: Response) => {
    try {
        const passengerId = (req as any).user?.id;
        if (!passengerId) return res.status(401).json({ ok: false, message: "Unauthorized" });

        const records = await PassengerReferralRecord.find({ referrerId: passengerId })
            .sort({ createdAt: -1 })
            .select("referredPhone bonusAmount status rejectionReason createdAt")
            .lean();

        return res.json({ ok: true, records });
    } catch (err: any) {
        return res.status(500).json({ ok: false, message: err?.message ?? "Server error" });
    }
};
