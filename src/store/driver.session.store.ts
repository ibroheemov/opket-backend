import { redis } from "../redis/redisClient";
import { DriverRedisKeys } from "../utils/enums";

type DriverSession = {
    driverId: string;
    tariff: string;
    lastUpdated: number;
};

export class DriverSessionStore {
    private key(driverId: string) {
        return `driver:${driverId}`;
    }

    private ttlSeconds = 60; // auto-clean dead sessions

    async setOnline(data: Omit<DriverSession, "lastUpdated">) {
        const key = this.key(data.driverId);
        const now = Date.now();

        const multi = redis.multi();

        // Presence sets
        multi.sAdd(DriverRedisKeys.ONLINE_DRIVERS, data.driverId);
        multi.sAdd(DriverRedisKeys.AVAILABLE_DRIVERS, data.driverId);

        // Session hash
        multi.hSet(key, {
            driverId: data.driverId,
            tariff: data.tariff,
            lastUpdated: now.toString(),
        });

        // Auto-expire dead sessions
        multi.expire(key, this.ttlSeconds);

        await multi.exec();
    }

    async setOffline(driverId: string) {
        const multi = redis.multi();

        multi.sRem(DriverRedisKeys.ONLINE_DRIVERS, driverId);
        multi.sRem(DriverRedisKeys.AVAILABLE_DRIVERS, driverId);
        multi.sRem(DriverRedisKeys.ACTIVE_OFFERS, driverId);

        multi.del(this.key(driverId));

        await multi.exec();
    }

    async upsertSession(data: DriverSession) {
        const key = this.key(data.driverId);
        const now = Date.now();

        const hash: Record<string, string> = {
            driverId: data.driverId,
            tariff: data.tariff,
            lastUpdated: now.toString(),
        };

        await redis.hSet(key, hash);
        await redis.expire(key, this.ttlSeconds);
    }

    async getCurrentSession(driverId: string): Promise<DriverSession | null> {
        const key = this.key(driverId);

        const session = await redis.hGetAll(key);

        // No session found (expired or offline)
        if (!session || Object.keys(session).length === 0) {
            return null;
        }

        return {
            driverId: session.driverId,
            tariff: session.tariff,
            lastUpdated: Number(session.lastUpdated),
        };
    }

    /* ---------------- AVAILABILITY ---------------- */

    async markAvailable(driverId: string) {
        await redis.sAdd(DriverRedisKeys.AVAILABLE_DRIVERS, driverId);
    }

    async markUnavailable(driverId: string) {
        await redis.sRem(DriverRedisKeys.AVAILABLE_DRIVERS, driverId);
    }

    /* ---------------- OFFERS ---------------- */

    async markAsOffered(driverId: string) {
        const multi = redis.multi();

        multi.sAdd(DriverRedisKeys.ACTIVE_OFFERS, driverId);
        multi.sRem(DriverRedisKeys.AVAILABLE_DRIVERS, driverId);

        await multi.exec();
    }

    async clearOffer(driverId: string) {
        const multi = redis.multi();

        multi.sRem(DriverRedisKeys.ACTIVE_OFFERS, driverId);
        multi.sAdd(DriverRedisKeys.AVAILABLE_DRIVERS, driverId);

        await multi.exec();
    }
}

export const driverSessionStore = new DriverSessionStore();
