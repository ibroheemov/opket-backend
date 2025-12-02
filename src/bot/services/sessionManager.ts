import { initUserSocket } from "../socket/userSocket";

export interface UserSession {
    location?: { lat: number; lon: number };
    lastLocation?: { lat: number; lon: number };
    rideId?: string,
    searchFinished?: boolean,
    phone?: string,
    currentMsgId?: number,
    loadingMessageId?: number,
    fareMessageId?: number,
    messageId?: number,
    driveron?: number,
    searchingMessage?: { messageId: number, stopAnimation: Function },
    messagesToDelete: number[],
    driverInfoMessageId?: number
}

export const userSessions: Record<number, UserSession> = {};

export function getSession(chatId: number): UserSession {
    return userSessions[chatId];
}

export function initializeUserSession(chatId: number) {
    if (!userSessions[chatId]) {
        initUserSocket(chatId);
        userSessions[chatId] = { messagesToDelete: [] };
    }
}
