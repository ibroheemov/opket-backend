import { redis } from "../redis/redisClient";
import { DriverRedisKeys } from "../utils/enums";

type DriverSession = {
    driverId: string;
    socketId: string;
    currentRideId?: string;
    lastUpdated: number;
};

export class DriverSessionStore {
    private key(driverId: string) {
        return `driver:${driverId}`;
    }

    private ttlSeconds = 60; // auto-clean dead sessions

    async setOnline(driverId: string) {
        const multi = redis.multi();

        multi.sAdd(DriverRedisKeys.ONLINE_DRIVERS, driverId);
        multi.sAdd(DriverRedisKeys.AVAILABLE_DRIVERS, driverId);

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
        const key = DriverRedisKeys.DRIVER;
        const now = Date.now();

        const hash: Record<string, string> = { ...data, lastUpdated: now.toString(), };

        await redis.hSet(key, hash);

        // TTL → auto cleanup if driver disappears
        await redis.expire(key, this.ttlSeconds);
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
