import { Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { ReferralRecordModel } from "../models/ReferralRecordModel";

// POST /driver/referral/submit-location  (new driver — uses authenticateDriver)
// Stores the referred driver's location for admin review. Does NOT award bonus.
export const submitDriverReferralLocation = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.driverId;
        if (!driverId) return res.status(401).json({ error: "Unauthorized" });

        const { lat, lng } = req.body;
        if (typeof lat !== "number" || typeof lng !== "number") {
            return res.status(400).json({ error: "lat and lng are required numbers" });
        }

        await ReferralRecordModel.findOneAndUpdate(
            { referredId: driverId, referredUserType: "driver", status: "pending_location" },
            { referredLocation: { lat, lng } }
        );

        return res.json({ ok: true });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
};

// POST /user/referral/submit-location  (passenger — uses requireAuth)
// Stores the referred passenger's location for admin review. Does NOT award bonus.
export const submitPassengerReferralLocation = async (req: Request, res: Response) => {
    try {
        const passengerId = (req as any).user?.id;
        if (!passengerId) return res.status(401).json({ error: "Unauthorized" });

        const { lat, lng } = req.body;
        if (typeof lat !== "number" || typeof lng !== "number") {
            return res.status(400).json({ error: "lat and lng are required numbers" });
        }

        await ReferralRecordModel.findOneAndUpdate(
            { referredId: passengerId, referredUserType: "passenger", status: "pending_location" },
            { referredLocation: { lat, lng } }
        );

        return res.json({ ok: true });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
};

// GET /driver/referral-records  (referrer — uses authenticateDriver)
export const getDriverReferralRecords = async (req: AuthRequest, res: Response) => {
    try {
        const referrerId = req.driverId;
        if (!referrerId) return res.status(401).json({ error: "Unauthorized" });

        const records = await ReferralRecordModel.find({ referrerId })
            .sort({ createdAt: -1 })
            .select("referredUserType status bonusAmount createdAt verifiedAt")
            .lean();

        return res.json({ records });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
};
