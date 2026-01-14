import { Request, Response } from "express";
import admin from "firebase-admin";
import { DriverModel, IDriverDocument } from "../models/DriverModel";
import { IRide, RideModel } from "../models/Ride";
import { AuthRequest } from "../middlewares/auth";
import { driverSockets, notifyUser, userSockets } from "../gateway/socket";
import haversine from "haversine-distance";
import { uploadBufferToCloudinary } from "../utils/uploadToCloudinary";
import jwt from "jsonwebtoken";
import { socketIo } from "../gateway/socket.maps";
import { generateAccessToken, generateRefreshToken, signJwt } from "../utils/jwt";

export const updateLocation = async (req: AuthRequest, res: Response) => {
    const { lat, lon } = req.body;
    if (!lat || !lon) return res.status(400).json({ error: "lat/lon required" });
    const driver = await DriverModel.findOneAndUpdate(
        { id: req.driverId },
        { location: { lat, lon } },
        { new: true }
    );
    if (!driver) return res.status(404).json({ error: "Driver not found" });

    // ✅ Broadcast driver movement if on an active ride
    if (driver.currentRideId) {
        const ride = await RideModel.findOne({ _id: driver.currentRideId });

        if (ride?.userChatId) {
            const userSocketId = userSockets.get(ride.userChatId);
            if (userSocketId) {
                socketIo.to(userSocketId).emit("driver_location_update", {
                    driver,
                    chatId: ride.userChatId,
                    location: { lat, lon },
                });
            }
        }

        if (ride && ride.status === "started") {

            if (ride.lastLocation) {
                const distanceMeters = haversine(
                    { lat: Number(ride.lastLocation.lat), lon: Number(ride.lastLocation.lon) },
                    { lat: Number(lat), lon: Number(lon) }
                );
                const distanceKm = distanceMeters / 1000;
                ride.distanceTraveled += distanceKm;

                const ratePerKm = 2000; // UZS/km
                ride.fare += Math.round(ride.distanceTraveled * ratePerKm);
            }

            ride.lastLocation = { lat, lon };
            await ride.save();

            // Optionally notify the user in real time
            const userSocketId = userSockets.get(Number(ride.userChatId));
            if (userSocketId) {
                socketIo.to(userSocketId).emit("ride_progress", {
                    distance: ride.distanceTraveled.toFixed(2),
                    fare: ride.fare,
                });
            }
        }
    }

    return res.json({ success: true, location: driver.location });
};

export const getDriver = async (req: AuthRequest, res: Response) => {
    const { chatId } = req.query;
    if (!chatId) return res.status(400).json({ error: "[chatId] is required" });

    const driver = await DriverModel.findOne(
        { chatId: chatId },
    );

    return res.json({ success: driver != null, driver: driver });
};


export const updateStatus = async (req: AuthRequest, res: Response) => {
    const { status, driverId } = req.body;

    if (!["online", "offline"].includes(status))
        return res.status(400).json({ error: "Invalid status" });

    const driver = await DriverModel.findOneAndUpdate(
        { _id: driverId },
        { status },
        { new: true }
    );
    if (!driver) return res.status(404).json({ error: "Driver not found" });

    return res.json({ success: true, status: driver.status });
};

export const getDriverBalance = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.params.id;

        const driver = await DriverModel.findById(driverId).select("balance");
        if (!driver) {
            return res.status(404).json({ message: "Driver not found" });
        }

        return res.json({ balance: driver.balance || 0 });
    } catch (error) {
        console.error("Error fetching driver balance:", error);
        res.status(500).json({ message: "Server error" });
    }
};

export const driverDashboard = async (req: AuthRequest, res: Response) => {
    try {
        const chatId = Number(req.body.chatId);
        if (!chatId) {
            return res.status(400).json({ error: "chatId is required" });
        }

        // Fetch driver info
        const driver: IDriverDocument | null = await DriverModel.findOne({ chatId });
        if (!driver) {
            return res.status(404).json({ error: "Driver not found" });
        }

        // Fetch rides associated with this driver
        const rides: IRide[] = await RideModel.find({ driverId: driver._id }).sort({ createdAt: -1 });

        res.json({
            driver: {
                id: driver._id,
                firstname: driver.firstname,
                lastname: driver.lastname,
                name: driver.name,
                phone: driver.phone,
                carModel: driver.carModel,
                carNumber: driver.carNumber,
                carColor: driver.carColor,
                vehicle: driver.vehicle,
                status: driver.status,
                location: driver.location,
                currentRideId: driver.currentRideId,
                selfie: driver.selfie,
                driver_license: driver.driver_license,
                passport: driver.passport,
            },
            rides,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
};

export const registerDriver = async (req: AuthRequest, res: Response) => {
    try {
        const { firstname, lastname, phone, carNumber, carModel, carColor, regionCode } = req.body;

        if (!firstname || !lastname || !phone) {
            return res.status(400).json({ message: "firstname, lastname and phone are required" });
        }

        // Prevent duplicate phone registrations
        const existing = await DriverModel.findOne({ phone });
        if (existing) {
            return res.status(400).json({ message: "Bu telefon raqamli haydovchi ro'yxatdan o'tgan" });
        }

        const name = `${firstname} ${lastname}`;
        const vehicle = `${carModel || "Unknown"} - ${carNumber || "N/A"}`;

        const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
        const licenseFile = files?.driverLicense?.[0];

        /**
         * 1️⃣ Create driver immediately
         */
        const newDriver = new DriverModel({
            name,
            firstname,
            lastname,
            phone,
            vehicle,
            regionCode,
            carColor,
            carModel,
            carNumber,
            status: "offline",

            // driver license state
            driver_license_status: licenseFile ? "PENDING_UPLOAD" : "NOT_PROVIDED",
        });

        await newDriver.save();

        /**
         * 2️⃣ Background upload (fire-and-forget)
         */
        if (licenseFile) {
            void uploadBufferToCloudinary(licenseFile.buffer, "drivers")
                .then(({ url, public_id }) =>
                    DriverModel.findByIdAndUpdate(newDriver._id, {
                        driver_license: {
                            url,
                            publicId: public_id,
                            status: "UPLOADED",
                        },
                    })
                )
                .catch((err) => {
                    console.error("Driver license upload failed:", err);

                    return DriverModel.findByIdAndUpdate(newDriver._id, {
                        "driver_license.status": "UPLOAD_FAILED",
                    });
                });
        }

        /**
         * 3️⃣ Tokens & response
         */
        const accessToken = generateAccessToken({ id: newDriver._id });
        const refreshToken = generateRefreshToken({ id: newDriver._id });

        return res.status(200).json({
            message: "Driver registered",
            driver: newDriver,
            accessToken,
            refreshToken,
        });
    } catch (err: any) {
        console.error("register driver error:", err);
        return res.status(500).json({
            message: "Internal server error",
            error: err.message,
        });
    }
};
