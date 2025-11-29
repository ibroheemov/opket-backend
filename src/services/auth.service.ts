// src/services/auth.service.ts
import { config } from "../bot/config/env";
import { DriverModel } from "../models/DriverModel";
import { generateAccessToken, generateRefreshToken, signJwt } from "../utils/jwt";
import fileUploadService from "./fileUpload.service";
import jwt from "jsonwebtoken";

class AuthService {

    /** Step 1 — Check if driver exists by phone */
    async checkDriver(phone: string) {
        const driver = await DriverModel.findOne({ phone }).lean();
        return !!driver;
    }

    /** Step 2 — Verify Firebase OTP ID token */
    async verifyFirebaseToken(firebaseToken: string) {
        // const decoded = await admin.auth().verifyIdToken(firebaseToken);

        // if (!decoded.phone_number) {
        //     throw new Error("Firebase token missing phone number");
        // }

        // const cleanPhone = decoded.phone_number.replace("+998", "").trim();

        // return cleanPhone;
    }

    async ensurePhoneNotRegistered(phone: string) {
        const existing = await DriverModel.findOne({ phone });
        if (existing) throw new Error("Driver with this phone already exists");
    }

    async createDriverDto(reqBody: any) {
        const { firstname, lastname, phone, carNumber, carModel, carColor } = reqBody;

        if (!firstname || !lastname || !phone) {
            throw new Error("firstname, lastname and phone are required");
        }

        return {
            firstname,
            lastname,
            phone,
            name: `${firstname} ${lastname}`,
            vehicle: `${carModel || "Unknown"} - ${carNumber || "N/A"}`,
            carColor,
            carModel,
            carNumber,
        };
    }


    /** Step 3 — Login driver & return JWT */
    async login(phone: string) {
        const driver = await DriverModel.findOne({ phone });

        if (!driver) {
            throw new Error("Driver not found");
        }

        const accessToken = generateAccessToken({ id: driver._id });
        const refreshToken = generateRefreshToken({ id: driver._id });

        return {
            accessToken,
            refreshToken,
            driverId: driver._id,
            driver,
        };
    }

    /** Step 4 — Register new driver (optional) */
    async registerDriver(reqBody: any, files: any) {
        const dto = await this.createDriverDto(reqBody);
        await this.ensurePhoneNotRegistered(dto.phone);

        const uploaded = await fileUploadService.uploadDriverFiles(files);

        const newDriver = new DriverModel({
            ...dto,
            status: "offline",
            selfie: uploaded.selfieUrl,
            driver_license: uploaded.licenseUrl,
            passport: uploaded.passportUrl,
        });

        await newDriver.save();

        const token = jwt.sign(
            { id: newDriver._id, phone: newDriver.phone },
            config.jwtSecret,
            { expiresIn: "7d" }
        );

        return { driver: newDriver, token };
    }
}

export default new AuthService();
