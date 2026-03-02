import { PassengerModel } from "../models/PassengerModel";

import { generateAccessToken, generateRefreshToken } from "../utils/jwt";
import { updateDriverBalance } from "../controllers/driver.controller";

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
            updateDriverBalance(referralCode, 0);
        }

        return this.buildAuthResponse(passenger, "New user created");
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