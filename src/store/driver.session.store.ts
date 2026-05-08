import { redis } from "../redis/redisClient";
import { DriverRedisKeys } from "../utils/enums";

type DriverSession = {
    driverId: string;
    tariff: string;
    lastUpdated: number;
    userPhoneNumber?: number;
    name?: string,
    phone?: string,
    carModel?: string,
    carColor?: string,
    carNumber?: string,
    regionCode?: string,
    location?: {
        latitude: number;
        longitude: number;
    };
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
            ...data,
            location: JSON.stringify(data.location),
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
    async upsertSession(data: Partial<DriverSession> & { driverId: string }) {

        const key = this.key(data.driverId);
        const now = Date.now();

        const hash: Record<string, string> = {};

        for (const [k, v] of Object.entries(data)) {
            if (v === undefined) continue;

            if (k === "location") {
                hash[k] = JSON.stringify(v);
            } else {
                hash[k] = String(v);
            }
        }

        // always update timestamp
        hash.lastUpdated = now.toString();

        await redis.hSet(key, hash);
        await redis.expire(key, this.ttlSeconds);
    }

    async getCurrentSession(driverId: string): Promise<DriverSession | null> {
        const key = this.key(driverId);
        const session = await redis.hGetAll(key);

        if (!session || Object.keys(session).length === 0) {
            return null;
        }

        let location: DriverSession["location"] | undefined;

        if (session.location) {
            try {
                const parsed = JSON.parse(session.location);
                if (
                    typeof parsed.latitude === "number" &&
                    typeof parsed.longitude === "number"
                ) {
                    location = parsed;
                }
            } catch {
                // ignore bad data
            }
        }

        return {
            driverId: session.driverId,
            tariff: session.tariff,
            lastUpdated: Number(session.lastUpdated),

            ...(session.name && { name: session.name }),
            ...(session.phone && { phone: session.phone }),
            ...(session.carModel && { carModel: session.carModel }),
            ...(session.carColor && { carColor: session.carColor }),
            ...(session.carNumber && { carNumber: session.carNumber }),
            ...(session.regionCode && { regionCode: session.regionCode }),
            ...(session.userPhoneNumber && { userPhoneNumber: Number(session.userPhoneNumber) }),
            ...(location && { location }),
        };
    }

    /* ---------------- AVAILABILITY ---------------- */

    async markAvailable(driverId: string) {
        const multi = redis.multi();

        multi.sAdd(DriverRedisKeys.AVAILABLE_DRIVERS, driverId);

        // remove userPhoneNumber field
        multi.hDel(this.key(driverId), "userPhoneNumber");

        multi.expire(this.key(driverId), this.ttlSeconds);

        await multi.exec();
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
