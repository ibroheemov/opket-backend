import { Response } from "express";
import { AuthRequest } from "../../middlewares/auth";
import { RideModel } from "../../models/Ride";
import moment from "moment-timezone";

export const getWeeklyStats = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.params.id;
        const timezone = "Asia/Tashkent";

        const now = moment().tz(timezone);

        // Monday 00:00 (start of week)
        const monday = now.clone().startOf("isoWeek");

        // Sunday 23:59:59.999 (end of week)
        const sunday = now.clone().endOf("isoWeek");

        // Fetch rides only inside this week
        const rides = await RideModel.find({
            driverId,
            status: "completed",
            endedAt: {
                $gte: monday.toDate(),
                $lte: sunday.toDate()
            }
        }).lean();

        // Initialize stats for Mon → Sun (index 0–6)
        const stats = Array.from({ length: 7 }, () => ({
            rideCount: 0,
            totalFare: 0
        }));

        for (const ride of rides) {
            if (!ride.endedAt) continue;

            // convert to driver's timezone
            const rideDate = moment(ride.endedAt).tz(timezone);

            // Monday = 0, ..., Sunday = 6
            const weekdayIndex = rideDate.isoWeekday() - 1;

            if (weekdayIndex >= 0 && weekdayIndex <= 6) {
                stats[weekdayIndex].rideCount += 1;
                stats[weekdayIndex].totalFare += ride.fare || 0;
            }
        }

        res.json({
            weekStart: monday.format("YYYY-MM-DD"),
            weekEnd: sunday.format("YYYY-MM-DD"),
            stats
        });

    } catch (err) {
        console.error("Weekly stats error:", err);
        res.status(500).json({ message: "Failed to fetch weekly stats" });
    }
};


export const getWeeklyStatsNew = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.driverId;
        const timezone = "Asia/Tashkent";

        const now = moment().tz(timezone);

        // Monday 00:00 (start of week)
        const monday = now.clone().startOf("isoWeek");

        // Sunday 23:59:59.999 (end of week)
        const sunday = now.clone().endOf("isoWeek");

        // Fetch rides only inside this week
        const rides = await RideModel.find({
            driverId,
            status: "completed",
            endedAt: {
                $gte: monday.toDate(),
                $lte: sunday.toDate()
            }
        }).lean();

        // Initialize stats for Mon → Sun (index 0–6)
        const stats = Array.from({ length: 7 }, () => ({
            rideCount: 0,
            totalFare: 0
        }));

        for (const ride of rides) {
            if (!ride.endedAt) continue;

            // convert to driver's timezone
            const rideDate = moment(ride.endedAt).tz(timezone);

            // Monday = 0, ..., Sunday = 6
            const weekdayIndex = rideDate.isoWeekday() - 1;

            if (weekdayIndex >= 0 && weekdayIndex <= 6) {
                stats[weekdayIndex].rideCount += 1;
                stats[weekdayIndex].totalFare += ride.fare || 0;
            }
        }

        res.json({
            weekStart: monday.format("YYYY-MM-DD"),
            weekEnd: sunday.format("YYYY-MM-DD"),
            stats
        });

    } catch (err) {
        console.error("Weekly stats error:", err);
        res.status(500).json({ message: "Failed to fetch weekly stats" });
    }
};
