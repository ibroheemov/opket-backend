import jwt from "jsonwebtoken";
import { Socket } from "socket.io";
import { SocketAuthPayload } from "../types/socket.types";

export const authenticateSocket = (socket: Socket): { driverId?: string; userChatId?: number } | null => {
    const { token, userChatId } = socket.handshake.auth || {};

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET!) as SocketAuthPayload;
            return { driverId: decoded.id };
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
