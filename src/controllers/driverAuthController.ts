// src/interfaces/http/driverAuthController.ts
import express from "express";
import jwt from "jsonwebtoken";
import axios from "axios";
import { MongoDriverRepo } from "../infra/repos/MongoDriverRepo";
import { driverSessions } from "../bot/sessions";
import { createHmac } from "crypto";
import { config } from "../bot/config/env";

interface TelegramUser {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    photo_url?: string;
    allows_write_to_pm?: boolean;
}

interface VerifyResult {
    ok: boolean;
    user?: TelegramUser;
}


export function makeDriverAuthController(driverRepo: MongoDriverRepo) {
    const router = express.Router();

    // Step 1: request OTP
    router.post("/request-otp", async (req, res) => {
        const { phone, chatId } = req.body;
        if (!phone || !chatId) return res.status(400).json({ error: "Phone and chatId required" });

        const driver = await driverRepo.findByPhone(phone);
        if (!driver) return res.status(404).json({ error: "Driver not found" });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

        await driverRepo.save({ ...driver, otp, otpExpiresAt, chatId });

        const isVerified = chatId == driver.chatId;
        if (!isVerified) await sendOtpViaTelegram(chatId, otp);
        res.json({ message: "OTP sent via Telegram", otp: isVerified ? otp : null });
    });

    // Step 2: verify OTP
    router.post("/verify-otp", async (req, res) => {
        const { phone, otp } = req.body;
        if (!phone || !otp) return res.status(400).json({ error: "Phone and OTP required" });

        const driver = await driverRepo.findByPhone(phone);
        if (!driver || driver.otp !== otp || new Date(driver.otpExpiresAt!) < new Date())
            return res.status(401).json({ error: "Invalid or expired OTP" });

        const token = jwt.sign({ id: driver.id, phone: driver.phone }, process.env.JWT_SECRET!, {
            expiresIn: "7d",
        });

        driver.otp = undefined;
        driver.otpExpiresAt = undefined;
        await driverRepo.save(driver);

        res.json({ token, driver });
    });

    router.post("/auth/telegram", (req, res) => {
        const { initData } = req.body;
        const verified = verifyTelegramInitData(initData);
        console.log(verified);

        if (!verified.ok || !verified.user) {
            return res.status(403).json({ authenticated: false });
        }


        const userId = verified.user.id;
        const session = driverSessions[userId];

        if (session?.token) {
            return res.json({
                authenticated: true,
                token: session.token,
                phone: session.phone,
                status: session.status,
            });
        } else {
            return res.json({ authenticated: false });
        }
    });

    return router;
}

async function sendOtpViaTelegram(chatId: number | string, otp: string) {
    const token = process.env.DRIVER_BOT_TOKEN;
    if (!token) {
        console.error("❌ TELEGRAM_TOKEN missing in env");
        throw new Error("Telegram token missing");
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const payload = {
        chat_id: chatId,
        text: `🔐 Your login code: *${otp}*`,
        parse_mode: "Markdown",
    };

    try {
        const res = await axios.post(url, payload, { timeout: 10_000 });
        let response = res.data as any;
        if (response.ok !== true) {
            console.warn("⚠️ Telegram sendMessage responded with non-ok:", res.data);
        }
        return res.data;
    } catch (err: unknown) {
        console.error("❌ Failed to send OTP via Telegram:", err);
        throw err; // rethrow unexpected ones
    }
}


// export function verifyTelegramInitData(initData: string): VerifyResult {
//     try {
//         console.log("BOTTOKEN", config.driverBotToken);

//         const parsed = new URLSearchParams(initData);

//         // For Mini Apps, the signed field is "signature"
//         const signature = parsed.get("signature");
//         if (!signature) {
//             console.log("signature", signature);
//             return { ok: false }
//         };

//         parsed.delete("signature"); // remove signature before verification

//         // Build data_check_string: key=value\n sorted by key, raw values
//         const dataCheckString = Array.from(parsed.entries())
//             .sort(([a], [b]) => a.localeCompare(b))
//             .map(([k, v]) => `${k}=${v}`) // use raw v, do NOT decode
//             .join("\n");

//         // Step 1: create secret key using bot token
//         const secretKey = createHmac("sha256", "WebAppData")
//             .update(config.driverBotToken)
//             .digest();

//         // Step 2: create HMAC-SHA256 of data_check_string
//         const calcHash = createHmac("sha256", secretKey)
//             .update(dataCheckString)
//             .digest("hex");

//         // Step 3: Compare to Telegram signature
//         if (calcHash !== signature) {
//             console.log("calcHash !== signature", calcHash);
//             console.log(" signature", signature);
//             return { ok: false }
//         };

//         // Step 4: Parse user JSON (URL-encoded)
//         const userParam = parsed.get("user");
//         const user: TelegramUser | undefined = userParam ? JSON.parse(decodeURIComponent(userParam)) : undefined;

//         return { ok: true, user };
//     } catch (err) {
//         console.error("verifyTelegramInitData error:", err);
//         return { ok: false };
//     }
// }

export function verifyTelegramInitData(initData: string) {
    try {
        const parsed = new URLSearchParams(initData);
        const signature = parsed.get("signature");
        if (!signature) return { ok: false };

        parsed.delete("signature");

        const dataCheckString = Array.from(parsed.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join("\n");

        const secretKey = createHmac("sha256", "WebAppData").update(config.driverBotToken).digest();

        const calcHashBuffer = createHmac("sha256", secretKey).update(dataCheckString).digest();
        const calcHashBase64 = calcHashBuffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

        if (calcHashBase64 !== signature) {
            console.log("calcHashBase64 !== signature", calcHashBase64);
            console.log(" signature", signature);
            return { ok: false }
        };

        const userParam = parsed.get("user");
        const user = userParam ? JSON.parse(decodeURIComponent(userParam)) : undefined;

        return { ok: true, user };
    } catch (err) {
        console.error(err);
        return { ok: false };
    }
}