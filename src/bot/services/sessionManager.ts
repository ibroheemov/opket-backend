export interface UserSession {
    location?: { lat: number; lon: number };
    lastLocation?: { lat: number; lon: number };
    rideId?: string,
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
    if (!userSessions[chatId]) userSessions[chatId] = { messagesToDelete: [] };
    return userSessions[chatId];
}
