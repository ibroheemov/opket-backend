import { Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { ReferralRecordModel } from "../models/ReferralRecordModel";
import { DriverModel } from "../models/DriverModel";
import { SettingsModel, SETTINGS_KEYS } from "../models/SettingsModel";
import { haversineDistanceKm } from "../utils/haversine";

/**
 * Automatic referral verification.
 *
 * Called as soon as the referred user's location is received. Compares the
 * location against the admin-configured referral zone (centre + radius set in
 * the admin panel's "Referral hududi" card) and decides the referral without
 * any manual step:
 *
 *   - radiusKm <= 0            → zone gate disabled → auto-approve
 *   - distance <= radiusKm     → inside zone        → auto-approve
 *   - distance >  radiusKm     → outside zone       → auto-reject
 *
 * On approval the referrer driver's withdrawable referralBonus is incremented.
 * The admin can still override this decision later from the approvals page.
 *
 * The status flip is an atomic, guarded update so that duplicate location
 * submissions (or a race with a manual override) can never credit twice.
 */
async function autoVerifyReferral(recordId: string): Promise<void> {
    const record = await ReferralRecordModel.findById(recordId);
    if (!record || record.status !== "pending_location") return;

    const loc = (record as any).referredLocation;
    if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") return;

    const bonusKey =
        record.referredUserType === "driver"
            ? SETTINGS_KEYS.DRIVER_REFERRAL_BONUS
            : SETTINGS_KEYS.PASSENGER_REFERRAL_BONUS;

    const [bonusDoc, latDoc, lngDoc, radiusDoc] = await Promise.all([
        SettingsModel.findOne({ key: bonusKey }),
        SettingsModel.findOne({ key: SETTINGS_KEYS.REFERRAL_ZONE_LAT }),
        SettingsModel.findOne({ key: SETTINGS_KEYS.REFERRAL_ZONE_LNG }),
        SettingsModel.findOne({ key: SETTINGS_KEYS.REFERRAL_ZONE_RADIUS_KM }),
    ]);

    const bonusAmount = bonusDoc?.value ?? 0;
    const radiusKm = radiusDoc?.value ?? 0;
    const centerLat = latDoc?.value ?? 0;
    const centerLng = lngDoc?.value ?? 0;

    let withinZone: boolean;
    if (radiusKm <= 0) {
        // Zone gate disabled — any received location auto-approves.
        withinZone = true;
    } else {
        const distanceKm = haversineDistanceKm(centerLat, centerLng, loc.lat, loc.lng);
        withinZone = distanceKm <= radiusKm;
    }

    const newStatus = withinZone ? "approved" : "rejected";

    // Atomic guard: only the request that actually transitions the record out
    // of "pending_location" proceeds to credit the bonus.
    const updated = await ReferralRecordModel.findOneAndUpdate(
        { _id: record._id, status: "pending_location" },
        {
            status: newStatus,
            bonusAmount: withinZone ? bonusAmount : 0,
            autoVerified: true,
            verifiedAt: new Date(),
        },
        { new: true }
    );
    if (!updated) return; // someone else (override / duplicate) won the race

    if (withinZone && bonusAmount > 0) {
        await DriverModel.findByIdAndUpdate(record.referrerId, {
            $inc: { referralBonus: bonusAmount, referrals: 1 },
        });
        await ReferralRecordModel.findByIdAndUpdate(record._id, { bonusCredited: true });
    }
}

// POST /driver/referral/submit-location  (new driver — uses authenticateDriver)
// Stores the referred driver's location, then auto-verifies the referral.
export const submitDriverReferralLocation = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.driverId;
        if (!driverId) return res.status(401).json({ error: "Unauthorized" });

        const { lat, lng } = req.body;
        if (typeof lat !== "number" || typeof lng !== "number") {
            return res.status(400).json({ error: "lat and lng are required numbers" });
        }

        const record = await ReferralRecordModel.findOneAndUpdate(
            { referredId: driverId, referredUserType: "driver", status: "pending_location" },
            { referredLocation: { lat, lng } },
            { new: true }
        );

        if (record) {
            await autoVerifyReferral(record._id.toString());
        }

        return res.json({ ok: true });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
};

// POST /user/referral/submit-location  (passenger — uses requireAuth)
// Stores the referred passenger's location, then auto-verifies the referral.
export const submitPassengerReferralLocation = async (req: Request, res: Response) => {
    try {
        const passengerId = (req as any).user?.id;
        if (!passengerId) return res.status(401).json({ error: "Unauthorized" });

        const { lat, lng } = req.body;
        if (typeof lat !== "number" || typeof lng !== "number") {
            return res.status(400).json({ error: "lat and lng are required numbers" });
        }

        const record = await ReferralRecordModel.findOneAndUpdate(
            { referredId: passengerId, referredUserType: "passenger", status: "pending_location" },
            { referredLocation: { lat, lng } },
            { new: true }
        );

        if (record) {
            await autoVerifyReferral(record._id.toString());
        }

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
