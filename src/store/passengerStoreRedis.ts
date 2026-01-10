import { redis } from "../redis/redisClient";

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


const SESSION_TTL = 60 * 60 * 24; // 24 hours

const sessionKey = (chatId: number) => `passenger:${chatId}`;

export async function getSessionRedis(chatId: number): Promise<UserSession> {
    const key = sessionKey(chatId);

    const data = await redis.get(key);

    if (!data) {
        const session: UserSession = { messagesToDelete: [] };
        await redis.set(key, JSON.stringify(session), {
            EX: SESSION_TTL,
        });
        return session;
    }

    return JSON.parse(data);
}

export async function saveSession(chatId: number, session: UserSession) {
    await redis.set(sessionKey(chatId), JSON.stringify(session), {
        EX: SESSION_TTL,
    });
}

export async function initializeUserSessionRedis(chatId: number) {
    const key = sessionKey(chatId);

    const exists = await redis.exists(key);
    if (!exists) {
        const session: UserSession = { messagesToDelete: [] };
        await redis.set(key, JSON.stringify(session), {
            EX: SESSION_TTL,
        });
    }
}
