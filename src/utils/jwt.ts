// src/utils/jwt.ts
import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_EXPIRY, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, REFRESH_TOKEN_EXPIRY } from "../config/constants";

export const signJwt = (payload: any) => {
    return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: "7d" });
};

export const verifyJwt = (token: string) => {
    return jwt.verify(token, process.env.JWT_SECRET!);
};


export function generateAccessToken(payload: object): string {
    return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function generateRefreshToken(payload: object): string {
    return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: REFRESH_TOKEN_EXPIRY });
}