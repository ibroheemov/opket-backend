import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../bot/config/env";

const JWT_SECRET = config.jwtSecret;

function unauthorized(res: Response, message = "Unauthorized") {
    return res.status(401).json({ ok: false, message });
}

/**
 * Verifies JWT and attaches req.user
 */
export async function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return unauthorized(res, "Missing token");
        }

        const token = authHeader.split(" ")[1];
        if (!token) return unauthorized(res);

        let payload;
        try {
            payload = verifyToken(token);
        } catch {
            return unauthorized(res, "Invalid or expired token");
        }

        // Attach safe user object
        req.user = {
            id: payload.id,
            role: payload.role,
        };

        next();
    } catch (err: any) {
        return res.status(500).json({
            ok: false,
            message: err?.message ?? "Server error",
        });
    }
}

export interface JwtPayload {
    id: string;
    role: "CONSUMER" | "COURIER" | "RESTAURANT_OWNER" | "ADMIN";
}

export function verifyToken(token: string): JwtPayload {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
}