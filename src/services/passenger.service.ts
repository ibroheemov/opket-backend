import { PassengerModel } from "../models/PassengerModel";
import { DriverModel } from "../models/DriverModel";
import { SettingsModel, SETTINGS_KEYS } from "../models/SettingsModel";
import { ReferralRecordModel } from "../models/ReferralRecordModel";
import { generateAccessToken, generateRefreshToken } from "../utils/jwt";
import mongoose from "mongoose";

export class PassengerService {
    static async createOrUpdatePassenger({
        phone,
        referralCode,
        existingPhone,
    }: {
        phone: number;
        referralCode?: string;
        existingPhone?: string;
    }) {
        /**
         * CASE 1: Replace phone
         */
        if (existingPhone) {
            let user = await PassengerModel.findOne({ phone: existingPhone });

            // If not found → create new
            if (!user) {
                return this.createNewPassenger(phone, referralCode);
            }

            // If new phone exists → login
            const existing = await PassengerModel.findOne({ phone });
            if (existing) {
                return this.buildAuthResponse(existing, "User already exists");
            }

            // Update
            user.phone = phone;
            await user.save();

            return this.buildAuthResponse(user, "Phone updated successfully");
        }

        /**
         * CASE 2: Login if exists
         */
        const existing = await PassengerModel.findOne({ phone });
        if (existing) {
            return this.buildAuthResponse(existing, "User already exists");
        }

        /**
         * CASE 3: Create new
         */
        return this.createNewPassenger(phone, referralCode);
    }

    private static async createNewPassenger(phone: number, referralCode?: string) {
        const passenger = await PassengerModel.create({ phone });

        if (referralCode) {
            await this.createPassengerReferralRecord(passenger._id.toString(), referralCode);
        }

        return this.buildAuthResponse(passenger, "New user created");
    }

    private static async createPassengerReferralRecord(passengerId: string, referralCode: string) {
        try {
            const isObjectId = mongoose.Types.ObjectId.isValid(referralCode) && referralCode.length === 24;
            const driver = isObjectId
                ? await DriverModel.findById(referralCode).select("_id")
                : await DriverModel.findOne({ referralCode }).select("_id");

            if (!driver) {
                console.warn(`Passenger referral: no driver found for code "${referralCode}"`);
                return;
            }

            await ReferralRecordModel.create({
                referrerId: driver._id,
                referredId: passengerId,
                referredUserType: "passenger",
                status: "pending_location",
            });
        } catch (err: any) {
            // Ignore duplicate key (passenger already has a record)
            if (err.code !== 11000) {
                console.error("Failed to create passenger referral record:", err);
            }
        }
    }

    private static buildAuthResponse(user: any, message: string) {
        const accessToken = generateAccessToken({
            id: user._id,
            role: "CONSUMER",
        });

        const refreshToken = generateRefreshToken({
            id: user._id,
            role: "CONSUMER",
        });

        return {
            message,
            accessToken,
            refreshToken,
        };
    }
}