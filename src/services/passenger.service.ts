import { PassengerModel } from "../models/PassengerModel";
import { DriverModel } from "../models/DriverModel";
import { SettingsModel, SETTINGS_KEYS } from "../models/SettingsModel";
import { ReferralRecordModel } from "../models/ReferralRecordModel";
import { generateAccessToken, generateRefreshToken } from "../utils/jwt";
import mongoose from "mongoose";
import crypto from "crypto";

function generatePassengerReferralCode(): string {
    return crypto.randomBytes(3).toString("hex").toUpperCase(); // e.g. "A3F9B2"
}

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
        // Generate unique referral code with retry on collision
        let code: string | undefined;
        for (let attempt = 0; attempt < 5; attempt++) {
            const candidate = generatePassengerReferralCode();
            const exists = await PassengerModel.exists({ referralCode: candidate });
            if (!exists) { code = candidate; break; }
        }

        const passenger = await PassengerModel.create({ phone, referralCode: code });

        if (referralCode) {
            // Try passenger-to-passenger referral first
            const awarded = await this.handlePassengerToPassengerReferral(
                passenger._id.toString(),
                referralCode,
            );
            // Fall back to driver-referral flow if no passenger matched
            if (!awarded) {
                await this.createDriverReferralRecord(passenger._id.toString(), referralCode);
            }
        }

        return this.buildAuthResponse(passenger, "New user created");
    }

    private static async handlePassengerToPassengerReferral(
        newPassengerId: string,
        referralCode: string,
    ): Promise<boolean> {
        try {
            const referrer = await PassengerModel.findOne({ referralCode }).select("_id");
            if (!referrer) return false;

            // Don't let a passenger refer themselves
            if (referrer._id.toString() === newPassengerId) return false;

            const bonusSetting = await SettingsModel.findOne({
                key: SETTINGS_KEYS.PASSENGER_TO_PASSENGER_REFERRAL_BONUS,
            });
            const bonus = bonusSetting?.value ?? 0;

            if (bonus > 0) {
                await PassengerModel.findByIdAndUpdate(referrer._id, {
                    $inc: { balance: bonus },
                });
                console.log(
                    `Passenger referral bonus: +${bonus} credited to passenger ${referrer._id}`,
                );
            }
            return true;
        } catch (err) {
            console.error("handlePassengerToPassengerReferral error:", err);
            return false;
        }
    }

    private static async createDriverReferralRecord(passengerId: string, referralCode: string) {
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