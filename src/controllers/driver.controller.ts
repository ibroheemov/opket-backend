// src/controllers/fareController.ts
import { Request, Response } from "express";
import { getFareByCity } from "../services/fare.service";
import { AuthRequest } from "../middlewares/auth";
import { DriverModel } from "../models/DriverModel";
import { WorkingAreaService } from "../services/working.area.service";
import { driverStore } from "../store/driverStore";
import { driverStoreRedis } from "../store/driverStoreRedis";
import { emitToDriver, emitToUser } from "../gateway/ride.socket";
import admin from 'firebase-admin';
import { payfareTransfer } from "../services/payfare.service";
import { RideModel } from "../models/Ride";
import { getUtcRange, Period } from "../utils/timeRange";
import { RideService } from "../services/ride.new.service";
import { RideRepository } from "../repositories/ride.repository";
// import { DriverService } from "../services/driver.service";
import { DriverLoginRequestBody } from "../types/driver.types";
import { da } from "zod/v4/locales";
import { Types } from "mongoose";
import { DriverRedisKeys } from "../utils/enums";
import { redis } from "../redis/redisClient";
import { driverSessionStore, DriverSessionStore } from "../store/driver.session.store";
import { driverCapabilityStore } from "../store/driver.capability.store";
import { GhostRideModel } from "../models/GhostRide";
import { driverLocationStore } from "../store/driver.location.store";

// import DriverModel from "../models/Driver"; // <- adjust path

export const generateQrLink = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.driverId; // carNumber like "T410OB"
        if (!driverId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized: driverId missing",
            });
        }

        const passengerPackage = process.env.PASSENGER_ANDROID_PACKAGE;
        if (!passengerPackage) {
            return res.status(500).json({
                success: false,
                message: "Server misconfigured: PASSENGER_ANDROID_PACKAGE not set",
            });
        }

        // Build Play Store install referrer payload
        // Keep it short and simple; you can add &area=... if you want later.
        const referrerPayload = `ref=${driverId}&src=driver_qr`;

        // Must be URL-encoded because it's nested inside another query param
        const encodedReferrer = encodeURIComponent(referrerPayload);

        const link =
            `https://play.google.com/store/apps/details` +
            `?id=${encodeURIComponent(passengerPackage)}` +
            `&referrer=${encodedReferrer}`;

        return res.json({
            success: true,
            link,
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to generate QR link",
        });
    }
};

export const cancelRide = async (req: Request, res: Response) => {
    try {
        const { rideId } = req.body;
        if (!rideId) return res.status(400).json({ error: "rideId required" });

        RideService.stopSearching(rideId);
        await RideService.clearDriverRideState(rideId, "");
        await RideRepository.setRideStatus(rideId, "cancelled", { by: "driver" });

        return res.json({ rideId, message: "Buyurtma bekor qilindi" });
    } catch (err: any) {
        const status = err?.statusCode ?? 500;
        const msg = status === 500 ? "Internal server error" : err.message;
        return res.status(status).json({ error: msg });
    }
};

export const getMyRides = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.driverId;
        const driverObjectId = new Types.ObjectId(driverId);
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
                    driverId: driverObjectId,
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

            // Merge GhostRides
            {
                $unionWith: {
                    coll: "ghostrides", // make sure this matches your actual collection name
                    pipeline: [
                        {
                            $match: {
                                driverId: driverObjectId,
                                createdAt: { $gte: startUtc, $lte: endUtc },
                            },
                        },
                        {
                            $addFields: {
                                source: "ghostRide",
                                userChatId: null,
                                userPhoneNumber: null,
                            },
                        },
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
                    ],
                },
            },

            { $sort: { createdAt: -1 } },
        ]);

        return res.json({
            driverId,
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

export const deductFromUser = async (req: AuthRequest, res: Response) => {
    try {
        const { phone, amount } = req.body;
        const driverId = req.driverId;

        if (!driverId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized: driverId missing",
            });
        }

        const result = await payfareTransfer({ phone, driverId, amount });

        return res.status(result.status).json(result.ok ? {
            success: true,
            message: result.message,
            passengerBalance: result.passengerBalance,
            driverBalance: result.driverBalance,
        } : { message: result.message });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const updateDriverBalance = async (driverId: string, amount: number) => {
    const updatedDriver = await DriverModel.findByIdAndUpdate(
        driverId,
        { $inc: { balance: amount, referrals: 1 } },
        { new: true }
    );

    emitToDriver(driverId, "balance_updated", { 'balance': updatedDriver?.balance });

    const fcmToken = updatedDriver?.fcmToken;
    if (!fcmToken) {
        return;
    }


    const message = {
        token: fcmToken,
        android: {
            priority: "high" as const,
        },
        data: {
            type: 'balance_updated',
            amount: amount.toString(),
            source: "Paynet",
            message: `Hisobingiz ${amount} UZS ga to'ldirildi.`
        },
    };

    try {
        await admin.messaging().send(message);
        return true;
    } catch (error) {
        return false;
    }
}


export const updateAppVersion = async (req: AuthRequest, res: Response) => {
    try {
        const { version } = req.body;
        const driverId = req.driverId;

        // 1️⃣ Validate input
        if (!version || typeof version !== "string") {
            return res.status(400).json({
                success: false,
                message: "app version is required",
            });
        }

        if (!driverId) {
            return res.status(401).json({
                success: false,
                message: "unauthorized",
            });
        }

        // 2️⃣ Update driver app version
        const updatedDriver = await DriverModel.findByIdAndUpdate(
            driverId,
            {
                appVersion: version,
                // appVersionUpdatedAt: new Date(), // optional but recommended
            },
            {
                new: true,
                runValidators: true,
            }
        );

        // 3️⃣ Handle not found
        if (!updatedDriver) {
            return res.status(404).json({
                success: false,
                message: "driver not found",
            });
        }

        // 4️⃣ Success response
        return res.status(200).json({
            success: true,
            message: "app version updated successfully",
            data: {
                driverId: updatedDriver._id,
                appVersion: updatedDriver.appVersion,
            },
        });
    } catch (error) {
        console.error("updateDriverBalance error:", error);

        return res.status(500).json({
            success: false,
            message: "internal server error",
        });
    }
};

function getHighestRatedTariffType(driver: any): string {
    if (!driver.tariffs?.length) {
        return "standard";
    }

    const highestTariff = driver.tariffs.reduce(
        (best: any, current: any) =>
            current.rating > best.rating ? current : best
    );

    return highestTariff.type || "standard";
}

export const setStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { status, location }: { status: string, location: any } = req.body;
        const driverId = req.driverId;

        if (!driverId) {
            return res.status(401).json({
                success: false,
                message: "unauthorized",
            });
        }

        if (status === "online") {
            const driver = await DriverModel.findById(driverId).select("tariffs, enabledOptions").populate("tariffs");
            const services = driver?.enabledOptions ?? [];
            const tariff = getHighestRatedTariffType(driver);

            await driverSessionStore.setOnline({ driverId, tariff });

            await driverCapabilityStore.addDriver(driverId, services);

            await driverLocationStore.updateLocation({ driverId, ...location, geoType: tariff })
        }

        if (status === "offline") {
            // 1 remove from online
            await driverSessionStore.setOffline(driverId);

            // 2 remove from geo indexes
            await driverLocationStore.removeDriver(driverId);

            // 3 fetch services
            const driver = await DriverModel.findById(driverId).select("enabledOptions");

            const services = driver?.enabledOptions ?? [];

            // 4 remove from capability sets
            await driverCapabilityStore.removeDriver(driverId, services);
        }

        return res.status(200).json({ success: true });

    } catch (err: any) {
        return res.status(500).json({ message: err?.message });
    }
};


export const getDriverStatus = async (
    req: AuthRequest,
    res: Response
) => {

    try {

        const driverId = req.driverId;

        if (!driverId) {
            return res.status(401).json({
                success: false,
                message: "unauthorized"
            });
        }

        const online = await redis.sIsMember(
            DriverRedisKeys.ONLINE_DRIVERS,
            driverId
        );

        return res.json({
            success: true,
            status: online
                ? "online"
                : "offline",

        });

    } catch (e: any) {

        return res.status(500).json({
            message: e.message
        });
    }
};

export const getRideStatus = async (
    req: AuthRequest,
    res: Response
) => {

    try {

        const rideId = req.params.id;

        if (!rideId) {
            return res.status(400).json({
                success: false,
                message: "rideId is required"
            });
        }

        const result = await RideModel.findById(rideId).select("status");

        return res.json({
            success: true,
            status: result?.status
        });

    } catch (e: any) {

        return res.status(500).json({
            message: e.message
        });
    }
};

export const createGhostRide = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.driverId;

        if (!driverId) {
            return res.status(401).json({
                success: false,
                message: "unauthorized",
            });
        }

        const result = await GhostRideModel.create({
            driverId: new Types.ObjectId(driverId),
            status: "started",
            statusHistory: [
                {
                    status: "started",
                    driverId,
                    by: "driver",
                    note: "Ride created",
                },
            ],
        })

        await driverSessionStore.markUnavailable(driverId);

        return res.status(200).json({ success: true, id: result.id });

    } catch (err: any) {
        return res.status(500).json({ message: err?.message });
    }
};

export const completeGhostRide = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.driverId;
        const data = req.body;
        const { id } = req.params;

        if (!driverId) {
            return res.status(401).json({
                success: false,
                message: "unauthorized",
            });
        }

        await GhostRideModel.findOneAndUpdate(
            { _id: id },
            {
                $set: { ...data, status: "completed", },
                $push: { statusHistory: { status: "completed", by: "driver" } },
            },
            { new: true }
        );


        await driverSessionStore.markAvailable(driverId);

        return res.status(200).json({ success: true });

    } catch (err: any) {
        return res.status(500).json({ message: err?.message });
    }
};

export const startRide = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.driverId;
        const { id } = req.params;

        if (!driverId) {
            return res.status(401).json({
                success: false,
                message: "unauthorized",
            });
        }

        const ride = await RideModel.findOneAndUpdate(
            { _id: id },
            {
                $set: { status: "started", },
                $push: { statusHistory: { status: "started", by: "driver" } },
            },
            { new: true }
        );

        if (!ride) {
            return res.status(400).json({
                success: false,
                message: "Ride not found",
            });
        }


        await driverSessionStore.markUnavailable(driverId);
        emitToUser(ride.userPhoneNumber, "ride_started", {});

        return res.status(200).json({ success: true });

    } catch (err: any) {
        return res.status(500).json({ message: err?.message });
    }
};