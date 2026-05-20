import { Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { ReferralRecordModel } from "../models/ReferralRecordModel";
import { PassengerReferralRecord } from "../models/PassengerReferralRecord";
import { DriverModel } from "../models/DriverModel";
import { PassengerModel } from "../models/PassengerModel";
import { SettingsModel, SETTINGS_KEYS } from "../models/SettingsModel";
import { ReferralZoneModel } from "../models/ReferralZoneModel";
import { haversineDistanceKm } from "../utils/haversine";

function pointInPolygon(
    point: { lat: number; lng: number },
    polygon: { lat: number; lng: number }[]
): boolean {
    const { lat: y, lng: x } = point;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const yi = polygon[i].lat, xi = polygon[i].lng;
        const yj = polygon[j].lat, xj = polygon[j].lng;
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * Automatic referral verification.
 *
 * Called as soon as the referred user's location is received. Compares the
 * location against the admin-configured referral polygon (drawn in the admin
 * panel's "Referral hududi" card) and decides the referral without any manual step:
 *
 *   - polygon has < 3 points   → zone gate disabled → auto-approve
 *   - point inside polygon     → inside zone        → auto-approve
 *   - point outside polygon    → outside zone       → auto-reject
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

    const [bonusDoc, zoneDoc, latDoc, lngDoc, radiusDoc] = await Promise.all([
        SettingsModel.findOne({ key: bonusKey }),
        ReferralZoneModel.findOne().lean(),
        SettingsModel.findOne({ key: SETTINGS_KEYS.REFERRAL_ZONE_LAT }),
        SettingsModel.findOne({ key: SETTINGS_KEYS.REFERRAL_ZONE_LNG }),
        SettingsModel.findOne({ key: SETTINGS_KEYS.REFERRAL_ZONE_RADIUS_KM }),
    ]);

    const bonusAmount = bonusDoc?.value ?? 0;
    const polygon = zoneDoc?.polygon ?? [];

    console.log("[autoVerifyReferral] recordId:", recordId);
    console.log("[autoVerifyReferral] loc:", JSON.stringify(loc));
    console.log("[autoVerifyReferral] polygon length:", polygon.length);
    console.log("[autoVerifyReferral] polygon:", JSON.stringify(polygon));

    let withinZone: boolean;
    if (polygon.length >= 3) {
        // Polygon configured — use precise polygon check.
        withinZone = pointInPolygon(loc, polygon);
        console.log("[autoVerifyReferral] method=polygon withinZone:", withinZone);
    } else {
        // No polygon yet — fall back to legacy radius check.
        const radiusKm = radiusDoc?.value ?? 0;
        if (radiusKm <= 0) {
            // Neither polygon nor radius configured — gate disabled, auto-approve.
            withinZone = true;
            console.log("[autoVerifyReferral] method=none (gate disabled) withinZone:", withinZone);
        } else {
            const centerLat = latDoc?.value ?? 0;
            const centerLng = lngDoc?.value ?? 0;
            withinZone = haversineDistanceKm(centerLat, centerLng, loc.lat, loc.lng) <= radiusKm;
            console.log("[autoVerifyReferral] method=radius center:", centerLat, centerLng, "radiusKm:", radiusKm, "withinZone:", withinZone);
        }
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

async function autoVerifyP2PReferral(recordId: string): Promise<void> {
    const record = await PassengerReferralRecord.findById(recordId);
    if (!record || record.status !== "pending_location") return;

    const [zoneDoc, latDoc, lngDoc, radiusDoc] = await Promise.all([
        ReferralZoneModel.findOne().lean(),
        SettingsModel.findOne({ key: SETTINGS_KEYS.REFERRAL_ZONE_LAT }),
        SettingsModel.findOne({ key: SETTINGS_KEYS.REFERRAL_ZONE_LNG }),
        SettingsModel.findOne({ key: SETTINGS_KEYS.REFERRAL_ZONE_RADIUS_KM }),
    ]);

    const polygon = zoneDoc?.polygon ?? [];

    let withinZone: boolean;
    if (polygon.length >= 3) {
        withinZone = pointInPolygon((record as any).referredLocation, polygon);
    } else {
        const radiusKm = radiusDoc?.value ?? 0;
        if (radiusKm <= 0) {
            withinZone = true;
        } else {
            const centerLat = latDoc?.value ?? 0;
            const centerLng = lngDoc?.value ?? 0;
            const loc = (record as any).referredLocation;
            withinZone = haversineDistanceKm(centerLat, centerLng, loc.lat, loc.lng) <= radiusKm;
        }
    }

    const updated = await PassengerReferralRecord.findOneAndUpdate(
        { _id: record._id, status: "pending_location" },
        {
            status: withinZone ? "approved" : "rejected",
            rejectionReason: withinZone ? null : "Joylashuv referral hududidan tashqarida",
        },
        { new: true }
    );
    if (!updated) return;

    if (withinZone && record.bonusAmount > 0) {
        await PassengerModel.findByIdAndUpdate(record.referrerId, {
            $inc: { balance: record.bonusAmount },
        });
        console.log(`P2P referral bonus: +${record.bonusAmount} credited to passenger ${record.referrerId}`);
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
// Stores the referred passenger's location, then auto-verifies both driver-referred
// and passenger-to-passenger pending referral records for this passenger.
export const submitPassengerReferralLocation = async (req: Request, res: Response) => {
    try {
        const passengerId = (req as any).user?.id;
        if (!passengerId) return res.status(401).json({ error: "Unauthorized" });

        const { lat, lng } = req.body;
        if (typeof lat !== "number" || typeof lng !== "number") {
            return res.status(400).json({ error: "lat and lng are required numbers" });
        }

        // Driver-referred passenger record
        const driverRecord = await ReferralRecordModel.findOneAndUpdate(
            { referredId: passengerId, referredUserType: "passenger", status: "pending_location" },
            { referredLocation: { lat, lng } },
            { new: true }
        );
        if (driverRecord) {
            await autoVerifyReferral(driverRecord._id.toString());
        }

        // Passenger-to-passenger record
        const p2pRecord = await PassengerReferralRecord.findOneAndUpdate(
            { referredId: passengerId, status: "pending_location" },
            { referredLocation: { lat, lng } },
            { new: true }
        );
        if (p2pRecord) {
            await autoVerifyP2PReferral(p2pRecord._id.toString());
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
