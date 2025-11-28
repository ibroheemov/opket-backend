import jwt from "jsonwebtoken";
import { Socket } from "socket.io";
import { SocketAuthPayload } from "../types/socket.types";

export const authenticateSocket = (socket: Socket): { driverId?: string; fcmToken?: string; userChatId?: number } | null => {
    const { token, fcmToken, userChatId } = socket.handshake.auth || {};

    if (token && fcmToken) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET!) as SocketAuthPayload;
            return { driverId: decoded.id, fcmToken };
        } catch {
            console.warn("❌ Invalid driver token");
            return null;
        }
    }

    if (userChatId) {
        return { userChatId: Number(userChatId) };
    }

    return null;
};
