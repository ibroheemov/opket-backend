import { initUserSocket } from "../socket/userSocket";

const ONE_MINUTE = 60 * 1000;
const TEN_MINUTES = 5 * 60 * 1000;
const MAX_ORDERS = 2;

export interface UserSession {
    location?: { lat: number; lon: number };
    lastLocation?: { lat: number; lon: number };
    rideId?: string,
    searchFinished?: boolean,
    phone?: number,
    currentMsgId?: number,
    loadingMessageId?: number,
    fareMessageId?: number,
    messageId?: number,
    driveron?: number,
    searchingMessage?: { messageId: number, stopAnimation: Function },
    messagesToDelete: number[],
    driverInfoMessageId?: number,
    driverId?: string,
    deduction_amount?: number,

    // ⬇️ NEW FIELDS
    orderCount?: number;          // number of orders in current window
    lastOrderTime?: number;       // timestamp in ms
    blockedUntil?: number;        // timestamp in ms
}

export const userSessions: Record<number, UserSession> = {};

export function getSession(chatId: number): UserSession {
    if (!userSessions[chatId]) {
        userSessions[chatId] = { messagesToDelete: [] };
    }
    return userSessions[chatId];
}

export function initializeUserSession(chatId: number) {
    if (!userSessions[chatId]) {
        userSessions[chatId] = { messagesToDelete: [] };
    }
}

export function checkOrderCooldown(session: UserSession): { allowed: boolean; message?: string } {
    const now = Date.now();

    // If user is fully blocked (after 3rd order)
    if (session.blockedUntil && now < session.blockedUntil) {
        const remaining = Math.ceil((session.blockedUntil - now) / 60000);
        return {
            allowed: false,
            message: `🚫 Juda ko'p urinishlar.\nYana taxi chaqirish uchun, iltimos ${remaining} daqiqa kuting`,
        };
    }

    // Initialize counters if missing
    session.orderCount ??= 0;
    session.lastOrderTime ??= 0;

    // Enforce 1-minute cooldown between orders
    if (session.lastOrderTime && now - session.lastOrderTime < ONE_MINUTE) {
        const remaining = Math.ceil((ONE_MINUTE - (now - session.lastOrderTime)) / 1000);
        return {
            allowed: false,
            message: `⏳ Iltimos ${remaining} sekund kuting yana taksi chaqirishdan oldin`,
        };
    }

    return { allowed: true };
}

export function registerSuccessfulOrder(session: UserSession) {
    const now = Date.now();

    session.orderCount = (session.orderCount ?? 0) + 1;
    session.lastOrderTime = now;

    // If user reaches max orders → block for 10 minutes
    if (session.orderCount >= MAX_ORDERS) {
        session.blockedUntil = now + TEN_MINUTES;
        session.orderCount = 0; // reset counter after block
    }
}
