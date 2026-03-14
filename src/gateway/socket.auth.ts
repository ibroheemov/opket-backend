import jwt from "jsonwebtoken";
import { Socket } from "socket.io";
import { SocketAuthPayload } from "../types/socket.types";
import { config } from "../bot/config/env";
import { DriverLocation } from "../types/location";

export const authenticateSocket = (socket: Socket): {
    driverId?: string;
    restaurantId?: string;
    isBackground?: boolean;
    fcmToken?: string;
    location?: DriverLocation;
    userChatId?: number,
    phone?: number
} | null => {
    const { token, isBackground, fcmToken, userChatId, phone, location, driverId, restaurantId } = socket.handshake.auth || {};

    try {
        const decoded = jwt.verify(token, config.jwtSecret) as SocketAuthPayload;
        const role = decoded.role;
        const id = decoded.id;

        console.log("ROLE: ", decoded.role, "ID:", decoded.id);

        if (role == "RESTAURANT_OWNER") {
            return { restaurantId: id, isBackground };
        }

    } catch (error) {
        console.warn("❌ Invalid driver token");
        return null;
    }


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
