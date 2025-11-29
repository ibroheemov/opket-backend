import { AuthRequest } from "../../middlewares/auth";
import { Response } from "express";
import jwt, { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import { generateAccessToken, generateRefreshToken } from "../../utils/jwt";
import { config } from "../../bot/config/env";

export const refreshToken = async (req: AuthRequest, res: Response) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(400).json({ error: "Refresh token is required" });
    }

    try {
        // Verify refresh token
        const decoded = jwt.verify(refreshToken, config.jwtSecret) as { id: string };

        // Optional: Ensure the token belongs to the same driver
        if (!decoded.id) {
            return res.status(403).json({ error: "Refresh token does not match the user" });
        }

        // Generate new tokens
        const newAccessToken = generateAccessToken({ id: decoded.id });
        const newRefreshToken = generateRefreshToken({ id: decoded.id });

        return res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
    } catch (err) {
        if (err instanceof TokenExpiredError) {
            return res.status(401).json({ error: "Refresh token expired" });
        } else if (err instanceof JsonWebTokenError) {
            return res.status(403).json({ error: "Invalid refresh token" });
        } else {
            console.error("Unexpected error in refreshToken:", err);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
};