// src/controllers/auth.controller.ts
import { Request, Response } from "express";
import authService from "../services/auth.service";
import { AuthRequest } from "../middlewares/auth";
import { DriverLoginRequestBody } from "../types/driver.types";

class AuthController {

    async sendOtp(req: Request, res: Response) {
        try {
            const { phone } = req.body;

            if (!phone) return res.status(400).json({ message: "Phone is required" });
            // TODO: request Telegram's [sendVerificationMessage] endpoint
            return res.json({ exists: true });
        } catch (err) {
            console.error("SEND OTP error:", err);
            return res.status(500).json({ message: "Server error" });
        }
    }

    async checkDriver(req: Request, res: Response) {
        try {
            return res.json({ exists: true });

            // const { phone } = req.body;

            // if (!phone) return res.status(400).json({ message: "Phone is required" });

            // const exists = await authService.checkDriver(phone);

            // if (!exists)
            //     return res.status(404).json({ message: "Driver not found" });

            // return res.json({ exists: true });
        } catch (err) {
            console.error("checkDriver error:", err);
            return res.status(500).json({ message: "Server error" });
        }
    }

    async login(req: Request, res: Response) {
        try {
            const data: DriverLoginRequestBody = req.body;

            const login = await authService.login(data);

            return res.json(login);
        } catch (err: any) {
            console.error("login error:", err);
            return res.status(500).json({ message: err?.message });
        }
    }

    async register(req: AuthRequest, res: Response) {
        try {
            // 1. Firebase token validation
            // await authService.verifyFirebaseToken(req.headers.authorization);

            // 2. Register driver
            const result = await authService.registerDriver(req.body, req.files);

            return res.status(200).json({
                message: "Driver registered",
                ...result,
            });
        } catch (err: any) {
            console.error("register driver error:", err);
            return res.status(400).json({
                message: err.message || "Internal server error",
            });
        }
    }
}

export default new AuthController();
