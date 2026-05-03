// src/controllers/fareController.ts
import { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { RideModel } from "../models/Ride";
import { getUtcRange, Period } from "../utils/timeRange";
import { Types } from "mongoose";

export const getMyRidesPassenger = async (req: AuthRequest, res: Response) => {
    try {
        const passengerId = req.id;
        const passengerObjectId = new Types.ObjectId(passengerId);
        const period = (req.query.period as Period) ?? "month";
        const date = (req.query.date as string) ?? new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const tz = (req.query.tz as string) ?? "UTC";

        if (!["day", "week", "month", "year"].includes(period)) {
            return res.status(400).json({ message: "Invalid period. Use day|week|month|year" });
        }

        const { startUtc, endUtc } = getUtcRange({ period, date, tz });

        const rides = await RideModel.aggregate([
            // Rides
            {
                $match: {
                    passengerId: passengerObjectId,
                    createdAt: { $gte: startUtc, $lte: endUtc },
                },
            },
            { $addFields: { source: "ride" } },
            {
                $project: {
                    _id: 1,
                    createdAt: 1,
                    fare: 1,
                    distanceTraveled: 1,
                    status: 1,
                    rideType: 1,
                    userChatId: 1,
                    userPhoneNumber: 1,
                    source: 1,
                },
            },
            { $sort: { createdAt: -1 } },
        ]);

        return res.json({
            passengerObjectId,
            period,
            date,
            tz,
            rangeUtc: { start: startUtc.toISOString(), end: endUtc.toISOString() },
            count: rides.length,
            rides,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error", error: (err as Error).message });
    }
};