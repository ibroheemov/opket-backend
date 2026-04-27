import jwt from "jsonwebtoken";
import { Socket } from "socket.io";
import { SocketAuthPayload } from "../types/socket.types";
import { config } from "../bot/config/env";
import { DriverLocation } from "../types/location";

export type SocketClient =
    | { type: "driver"; id: string }
    | { type: "restaurant"; id: string }
    | { type: "passenger"; id: string }
    | { type: "user"; id: string };


export const authenticateSocket = (socket: Socket): SocketClient | null => {
    const { token, isBackground } = socket.handshake.auth || {};

    if (!token) return null;

    try {
        const decoded = jwt.verify(token, config.jwtSecret) as SocketAuthPayload;

        switch (decoded.role) {
            case "DRIVER":
                return { type: "driver", id: decoded.id };
            case "RESTAURANT_OWNER":
                return { type: "restaurant", id: decoded.id };
            case "CONSUMER":
                return { type: "passenger", id: decoded.id };
            default:
                return null;
        }
    } catch {
        return null;
    }
};