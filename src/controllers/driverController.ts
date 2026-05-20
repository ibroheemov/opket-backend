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
import { services } from "../data/fare.database";
import { driverStoreRedis } from "../store/driverStoreRedis";
import { driverCapabilityStore } from "../store/driver.capability.store";
import { randomBytes } from "crypto";
import { ReferralRecordModel } from "../models/ReferralRecordModel";
import { SettingsModel, SETTINGS_KEYS } from "../models/SettingsModel";
import CarOption from "../models/CarOption";

function generateReferralCode(): string {
    return randomBytes(3).toString("hex").slice(0, 5).toUpperCase();
}

export const updateLocation = async (req: AuthRequest, res: Response) => {
    const { lat, lon, bearing } = req.body;
    const driverId = req.driverId;

    if (!driverId) return res.status(400).json({ error: "driverId required" });

    if (!lat || !lon) return res.status(400).json({ error: "lat/lon required" });

    const driver = await driverStoreRedis.get(driverId);
    // await driverStoreRedis.updateLocation({ driverId, lon, lat, bearing })

    // const driver = await DriverModel.findOneAndUpdate(
    //     { id: req.driverId },
    //     { location: { lat, lon } },
    //     { new: true }
    // );
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

export const getCarOptions = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.driverId;

        if (!driverId) {
            return res.status(400).json({ message: "driverId is required" });
        }

        const driver = await DriverModel.findById(driverId)
            .select({ enabledOptions: 1 })
            .lean();

        if (!driver) {
            return res.status(404).json({ message: "Driver not found" });
        }

        const enabledServices =
            driver.enabledOptions ?? []

        return res.json(enabledServices);
    } catch (error) {
        console.error("Error fetching services", error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const toggleCarOption = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.driverId;
        const { option } = req.body;

        if (!driverId) {
            return res.status(400).json({ message: "driverId is required" });
        }

        if (!option || typeof option !== "string") {
            return res.status(400).json({ message: "option is required" });
        }

        const driver = await DriverModel.findById(driverId)
            .select({ enabledOptions: 1 });

        if (!driver) {
            return res.status(404).json({ message: "Driver not found" });
        }

        const enabledOptions = driver.enabledOptions ?? [];

        let updatedOptions;
        let action: "added" | "removed";

        if (enabledOptions.includes(option)) {
            // Remove from Mongo
            updatedOptions = enabledOptions.filter(
                item => item !== option
            );

            driver.enabledOptions = updatedOptions;
            await driver.save();

            // Remove from Redis
            await driverCapabilityStore.removeDriver(
                driverId,
                [option]
            );

            action = "removed";
        } else {
            // Add to Mongo
            updatedOptions = [...enabledOptions, option];

            driver.enabledOptions = updatedOptions;
            await driver.save();

            // Add to Redis
            await driverCapabilityStore.addDriver(
                driverId,
                [option]
            );

            action = "added";
        }

        driver.enabledOptions = updatedOptions;
        await driver.save();
        await driverCapabilityStore.addDriver(driverId, updatedOptions);

        return res.json(updatedOptions);

    } catch (error) {
        console.error("Error toggling car option", error);
        return res.status(500).json({ message: "Server error" });
    }
};


export const getDriverBalanceNew = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.driverId;

        const driver = await DriverModel.findById(driverId).select("balance wallet");
        if (!driver) {
            return res.status(404).json({ message: "Driver not found" });
        }

        return res.json({ balance: driver.balance || 0, wallet: (driver as any).wallet || 0 });
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
                driver_photo: driver.driver_photo,
                license_front: driver.license_front,
                license_back: driver.license_back,
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
        const { firstname, lastname, phone, carNumber, carModel, carColor, regionCode, password, referralCode: usedReferralCode } = req.body;

        if (!firstname || !lastname || !phone) {
            return res.status(400).json({ message: "firstname, lastname and phone are required" });
        }

        const existing = await DriverModel.findOne({ phone });
        if (existing) {
            return res.status(400).json({ message: "Bu telefon raqamli haydovchi ro'yxatdan o'tgan" });
        }

        let referredBy: string | undefined;
        let referrerId: string | undefined;
        if (usedReferralCode) {
            const referrer = await DriverModel.findOne({ referralCode: usedReferralCode }).select("_id");
            if (referrer) {
                referredBy = referrer._id.toString();
                referrerId = referrer._id.toString();
            }
        }

        // Generate a unique referral code for this new driver
        let referralCode: string;
        let attempts = 0;
        do {
            referralCode = generateReferralCode();
            attempts++;
        } while (await DriverModel.exists({ referralCode }) && attempts < 10);

        const name = `${firstname} ${lastname}`;
        const vehicle = `${carModel || "Unknown"} - ${carNumber || "N/A"}`;

        const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
        const frontFile = files?.licenseFront?.[0];
        const backFile = files?.licenseBack?.[0];
        const photoFile = files?.driverPhoto?.[0];

        const newDriver = new DriverModel({
            name, firstname, lastname, phone, password, vehicle,
            regionCode, carColor, carModel, carNumber,
            status: "offline",
            documentsApproved: false,
            canReceiveOffers: false,
            referralCode,
            referralBonus: 0,
            ...(referredBy && { referredBy }),
            license_front:  { status: frontFile ? "PENDING_UPLOAD" : "NOT_PROVIDED" },
            license_back:   { status: backFile  ? "PENDING_UPLOAD" : "NOT_PROVIDED" },
            driver_photo:   { status: photoFile ? "PENDING_UPLOAD" : "NOT_PROVIDED" },
        });

        await newDriver.save();

        if (referrerId) {
            ReferralRecordModel.create({
                referrerId,
                referredId: newDriver._id.toString(),
                referredUserType: "driver",
                status: "pending_location",
            }).catch((err) => {
                if (err.code !== 11000) console.error("Failed to create driver referral record:", err);
            });
        }

        const uploadDoc = async (
            file: Express.Multer.File,
            field: "license_front" | "license_back" | "driver_photo"
        ) => {
            try {
                const { url, public_id } = await uploadBufferToCloudinary(file.buffer, "drivers");
                await DriverModel.findByIdAndUpdate(newDriver._id, {
                    [field]: { url, publicId: public_id, status: "UPLOADED" },
                });
            } catch (err) {
                console.error(`Upload failed for ${field}:`, err);
                await DriverModel.findByIdAndUpdate(newDriver._id, {
                    [`${field}.status`]: "UPLOAD_FAILED",
                });
            }
        };

        if (frontFile) void uploadDoc(frontFile, "license_front");
        if (backFile)  void uploadDoc(backFile,  "license_back");
        if (photoFile) void uploadDoc(photoFile, "driver_photo");

        const accessToken  = generateAccessToken({ id: newDriver._id, role: "DRIVER" });
        const refreshToken = generateRefreshToken({ id: newDriver._id, role: "DRIVER" });

        return res.status(200).json({
            message: "Driver registered",
            driver: newDriver,
            accessToken,
            refreshToken,
        });
    } catch (err: any) {
        console.error("register driver error:", err);
        return res.status(500).json({ message: "Internal server error", error: err.message });
    }
};

export const approveDriverDocuments = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const driver = await DriverModel.findById(id);

        if (!driver) return res.status(404).json({ message: "Driver not found" });

        // Give registration bonus to the approved driver
        const regBonusSetting = await SettingsModel.findOne({ key: SETTINGS_KEYS.DRIVER_REGISTRATION_BONUS });
        const regBonusAmount = regBonusSetting?.value ?? 0;
        if (regBonusAmount > 0) {
            await DriverModel.findByIdAndUpdate(id, { $inc: { balance: regBonusAmount } });
        }

        // Send FCM approval notification to the approved driver
        if (driver.fcmToken) {
            try {
                const bonusBody = regBonusAmount > 0
                    ? `Siz endi linyaga chiqib buyurtma olishingiz mumkin! Hisobingizga ${regBonusAmount.toLocaleString()} UZS bonus qo'shildi.`
                    : "Siz endi linyaga chiqib buyurtma olishingiz mumkin!";
                await admin.messaging().send({
                    token: driver.fcmToken,
                    android: { priority: "high" },
                    data: regBonusAmount > 0 ? {
                        type: "registration_bonus",
                        amount: regBonusAmount.toString(),
                    } : {},
                    notification: {
                        title: "Hujjatlaringiz tasdiqlandi ✅",
                        body: bonusBody,
                    },
                });
            } catch (_) {}
        }

        // Send FCM referral bonus notification to the referrer only if the
        // referral was actually approved (location was verified inside the zone).
        if (driver.referredBy) {
            try {
                const referralRecord = await ReferralRecordModel.findOne({
                    referredId: driver._id,
                    referredUserType: "driver",
                }).select("status bonusAmount bonusCredited").lean();

                if (referralRecord?.status === "approved" && referralRecord.bonusCredited) {
                    const creditedAmount = referralRecord.bonusAmount ?? 0;
                    if (creditedAmount > 0) {
                        const referrer = await DriverModel.findById(driver.referredBy).select("fcmToken");
                        if (referrer?.fcmToken) {
                            try {
                                await admin.messaging().send({
                                    token: referrer.fcmToken,
                                    android: { priority: "high" },
                                    data: {
                                        type: "referral_bonus",
                                        amount: creditedAmount.toString(),
                                        message: `Referalingiz tasdiqlandi! Hisobingizga ${creditedAmount} UZS bonus qo'shildi.`,
                                    },
                                    notification: {
                                        title: "Referral bonus 🎉",
                                        body: `Referalingiz tasdiqlandi! ${creditedAmount} UZS bonus qo'shildi.`,
                                    },
                                });
                            } catch (_) {}
                        }
                    }
                }
            } catch (bonusErr) {
                console.error("Failed to send referral bonus FCM:", bonusErr);
            }
        }

        return res.status(200).json({ success: true, driver });
    } catch (err: any) {
        return res.status(500).json({ message: err.message });
    }
};

export const rejectDriverDocuments = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { comment } = req.body as { comment?: string };
        const driver = await DriverModel.findById(id);

        if (!driver) return res.status(404).json({ message: "Driver not found" });

        if (driver.fcmToken) {
            try {
                await admin.messaging().send({
                    token: driver.fcmToken,
                    android: { priority: "high" },
                    notification: {
                        title: "Hujjatlaringiz rad etildi ❌",
                        body: comment
                            ? `Sabab: ${comment}`
                            : "Hujjatlaringiz qabul qilinmadi. Iltimos, qayta yuklang.",
                    },
                });
            } catch (_) {}
        }

        return res.status(200).json({ success: true });
    } catch (err: any) {
        return res.status(500).json({ message: err.message });
    }
};

export const resetDriverDocumentStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const driver = await DriverModel.findById(id);

        if (!driver) return res.status(404).json({ message: "Driver not found" });

        if (driver.fcmToken) {
            try {
                await admin.messaging().send({
                    token: driver.fcmToken,
                    android: { priority: "high" },
                    notification: {
                        title: "Hujjatlaringiz qayta ko'rib chiqilmoqda 🔄",
                        body: "Administrator hujjatlaringizni qayta ko'rib chiqmoqda. Tez orada xabar beramiz.",
                    },
                });
            } catch (_) {}
        }

        return res.status(200).json({ success: true });
    } catch (err: any) {
        return res.status(500).json({ message: err.message });
    }
};

export const getRegistrationOptions = async (req: Request, res: Response) => {
    try {
        const [carModels, carColors] = await Promise.all([
            CarOption.find({ type: "car_model" }).sort({ sort_order: 1 }).lean(),
            CarOption.find({ type: "car_color" }).sort({ sort_order: 1 }).lean(),
        ]);
        res.json({
            carModels: carModels.map((m) => m.value),
            carColors: carColors.map((c) => c.value),
        });
    } catch (error) {
        res.status(500).json({ error });
    }
};
