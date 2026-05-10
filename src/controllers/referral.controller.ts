import { Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { ReferralRecordModel } from "../models/ReferralRecordModel";
import { DriverModel } from "../models/DriverModel";
import { SettingsModel, SETTINGS_KEYS } from "../models/SettingsModel";

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getZoneSettings(): Promise<{ lat: number; lng: number; radiusKm: number }> {
    const [latDoc, lngDoc, radiusDoc] = await Promise.all([
        SettingsModel.findOne({ key: SETTINGS_KEYS.REFERRAL_ZONE_LAT }),
        SettingsModel.findOne({ key: SETTINGS_KEYS.REFERRAL_ZONE_LNG }),
        SettingsModel.findOne({ key: SETTINGS_KEYS.REFERRAL_ZONE_RADIUS_KM }),
    ]);
    return {
        lat: latDoc?.value ?? 0,
        lng: lngDoc?.value ?? 0,
        radiusKm: radiusDoc?.value ?? 0,
    };
}

async function verifyAndAward(
    referredId: string,
    referredUserType: "passenger" | "driver",
    lat: number,
    lng: number,
    bonusKey: typeof SETTINGS_KEYS[keyof typeof SETTINGS_KEYS]
) {
    const record = await ReferralRecordModel.findOne({ referredId, referredUserType });
    if (!record || record.status !== "pending_location") return;

    const zone = await getZoneSettings();

    // If zone is not configured (radiusKm = 0), skip location check and approve
    let inZone = true;
    if (zone.radiusKm > 0) {
        const dist = haversineKm(zone.lat, zone.lng, lat, lng);
        inZone = dist <= zone.radiusKm;
    }

    if (!inZone) {
        await ReferralRecordModel.findByIdAndUpdate(record._id, {
            status: "out_of_range",
            verifiedAt: new Date(),
        });
        return;
    }

    const bonusSetting = await SettingsModel.findOne({ key: bonusKey });
    const bonusAmount = bonusSetting?.value ?? 0;

    await ReferralRecordModel.findByIdAndUpdate(record._id, {
        status: "approved",
        bonusAmount,
        verifiedAt: new Date(),
    });

    if (bonusAmount > 0) {
        await DriverModel.findByIdAndUpdate(record.referrerId, {
            $inc: { referralBonus: bonusAmount, referrals: 1 },
        });
    }
}

// POST /user/referral/verify-location  (passenger — uses requireAuth)
export const verifyPassengerReferralLocation = async (req: Request, res: Response) => {
    try {
        const passengerId = (req as any).user?.id;
        if (!passengerId) return res.status(401).json({ error: "Unauthorized" });

        const { lat, lng } = req.body;
        if (typeof lat !== "number" || typeof lng !== "number") {
            return res.status(400).json({ error: "lat and lng are required numbers" });
        }

        await verifyAndAward(passengerId, "passenger", lat, lng, SETTINGS_KEYS.PASSENGER_REFERRAL_BONUS);
        return res.json({ ok: true });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
};

// POST /driver/referral/verify-location  (new driver — uses authenticateDriver)
export const verifyDriverReferralLocation = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.driverId;
        if (!driverId) return res.status(401).json({ error: "Unauthorized" });

        const { lat, lng } = req.body;
        if (typeof lat !== "number" || typeof lng !== "number") {
            return res.status(400).json({ error: "lat and lng are required numbers" });
        }

        await verifyAndAward(driverId, "driver", lat, lng, SETTINGS_KEYS.DRIVER_REFERRAL_BONUS);
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
