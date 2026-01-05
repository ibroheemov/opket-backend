import jwt from "jsonwebtoken";
import { Socket } from "socket.io";
import { SocketAuthPayload } from "../types/socket.types";
import { config } from "../bot/config/env";
import { DriverLocation } from "../types/location";

export const authenticateSocket = (socket: Socket): {
    driverId?: string;
    isBackground?: boolean;
    fcmToken?: string;
    location?: DriverLocation;
    userChatId?: number,
    phone?: number
} | null => {
    const { token, isBackground, fcmToken, userChatId, phone, location } = socket.handshake.auth || {};

    if (token && isBackground) {
        try {
            const decoded = jwt.verify(token, config.jwtSecret) as SocketAuthPayload;
            return { driverId: decoded.id, isBackground };
        } catch {
            console.warn("❌ Invalid driver token");
            return null;
        }
    }

    if (token && fcmToken && location) {
        try {
            const decoded = jwt.verify(token, config.jwtSecret) as SocketAuthPayload;
            return { driverId: decoded.id, fcmToken, location };
        } catch {
            console.warn("❌ Invalid driver token");
            return null;
        }
    }

    if (userChatId) {
        return { userChatId: Number(userChatId) };
    }

    if (phone) {
        return { phone };
    }

    return null;
};
