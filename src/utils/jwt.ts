// src/utils/jwt.ts
import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_EXPIRY, REFRESH_TOKEN_EXPIRY } from "../config/constants";
import { config } from "../bot/config/env";

export const signJwt = (payload: any) => {
    return jwt.sign(payload, config.jwtSecret, { expiresIn: "2y" });
};

export const verifyJwt = (token: string) => {
    return jwt.verify(token, config.jwtSecret);
};


export function generateAccessToken(payload: object): string {
    return jwt.sign(payload, config.jwtSecret, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function generateRefreshToken(payload: object): string {
    return jwt.sign(payload, config.jwtSecret, { expiresIn: REFRESH_TOKEN_EXPIRY });
}