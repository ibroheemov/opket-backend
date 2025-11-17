import { Response } from "express";
import { AuthRequest } from "../../middlewares/auth";
import { RideModel } from "../../models/Ride";
import moment from "moment-timezone";

export const getWeeklyStats = async (req: AuthRequest, res: Response) => {

    try {
        const driverId = req.params.id;
        const timezone = "Asia/Tashkent"; // Adjust to your driver's timezone

        // Calculate current week (Monday → Sunday)
        const now = moment().tz(timezone);
        const monday = now.clone().startOf("isoWeek"); // Monday 00:00
        const sunday = monday.clone().endOf("isoWeek"); // Sunday 23:59:59

        // Fetch all completed rides in current week
        const rides = await RideModel.find({
            driverId,
            status: "completed",
            endedAt: { $gte: monday.toDate(), $lte: sunday.toDate() },
        }).lean();

        console.log("RIDES:", rides, "driverID:", driverId);


        // Initialize stats array for Mon → Sun
        const stats = Array.from({ length: 7 }, () => ({
            rideCount: 0,
            totalFare: 0,
        }));

        // Populate stats
        rides.forEach((ride) => {
            const rideDate = moment(ride.endedAt).tz(timezone);
            const index = rideDate.isoWeekday() - 1; // Monday=0, Sunday=6
            stats[index].rideCount += 1;
            stats[index].totalFare += ride.fare || 0;
        });

        res.json({ stats });
    } catch (err) {
        console.error("Weekly stats error:", err);
        res.status(500).json({ message: "Failed to fetch weekly stats" });
    }
};