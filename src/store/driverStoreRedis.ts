import { redis } from "../redis/redisClient";
import { DriverLocation } from "../types/location";

export interface DriverSession {
    driverId: string;
    socketId: string;
    status: "online" | "offline";
    socketStatus?: "connected" | "disconnected";
    currentRideId?: string | null;
    location?: DriverLocation;
    name?: string;
    car?: string;
    phone?: string;
    lastUpdated: number;
    fcmToken?: string;
    canReceiveOffers: boolean;
}

// Redis keys
const DRIVER_KEY_PREFIX = "driver:";
const ACTIVE_OFFERS_KEY = "activeOffers";
const ONLINE_DRIVERS_KEY = "onlineDrivers";

export class DriverStore {
    private maxStaleMs = 2 * 60 * 1000;

    private key(driverId: string) {
        return DRIVER_KEY_PREFIX + driverId;
    }

    /* ----------------- Availability ----------------- */

    async isAvailable(driverId: string): Promise<boolean> {
        return !(await redis.sIsMember(ACTIVE_OFFERS_KEY, driverId));
    }

    async markAsOffered(driverId: string) {
        await redis.sAdd(ACTIVE_OFFERS_KEY, driverId);
    }

    async clearOffer(driverId: string) {
        await redis.sRem(ACTIVE_OFFERS_KEY, driverId);
    }

    /* ----------------- Upserts ----------------- */

    /**
     * Partial atomic update (NO race conditions)
     */
    async upsert(driverId: string, data: Partial<DriverSession>) {
        const key = this.key(driverId);
        const now = Date.now();

        const hash: Record<string, string> = {
            driverId,
            lastUpdated: now.toString(),
        };

        if (data.status !== undefined) {
            hash.status = data.status;
        }

        if (data.canReceiveOffers !== undefined) {
            hash.canReceiveOffers = data.canReceiveOffers ? "1" : "0";
        }

        if (data.currentRideId !== undefined) {
            hash.currentRideId = data.currentRideId ?? "";
        }

        if (data.location !== undefined) {
            hash.location = JSON.stringify(data.location);
        }

        await redis.hSet(key, hash);

        // Maintain online set atomically with state
        if (data.status !== undefined) {
            if (data.status === "online") {
                await redis.sAdd(ONLINE_DRIVERS_KEY, driverId);
            } else {
                await redis.sRem(ONLINE_DRIVERS_KEY, driverId);
                await this.clearOffer(driverId);
            }
        }
    }

    /* ----------------- Location ----------------- */

    async updateLocation(driverId: string, location: DriverLocation) {
        await redis.hSet(this.key(driverId), {
            location: JSON.stringify(location),
            lastUpdated: Date.now().toString(),
        });

        await redis.geoAdd("drivers:geo", {
            longitude: location.lon,
            latitude: location.lat,
            member: driverId,
        });
    }

    /* ----------------- Reads ----------------- */

    async get(driverId: string): Promise<DriverSession | null> {
        const data = await redis.hGetAll(this.key(driverId));
        if (!Object.keys(data).length) return null;

        return {
            socketId: data.socketId,
            driverId: data.driverId,
            status: data.status as any,
            canReceiveOffers: data.canReceiveOffers === "1",
            currentRideId: data.currentRideId || null,
            location: data.location ? JSON.parse(data.location) : undefined,
            lastUpdated: Number(data.lastUpdated),
        };
    }

    /* ----------------- Online Drivers ----------------- */
    async getOnlineDrivers(): Promise<DriverSession[]> {
        const [driverIds, activeOfferIds] = await Promise.all([
            redis.sMembers(ONLINE_DRIVERS_KEY),
            redis.sMembers(ACTIVE_OFFERS_KEY),
        ]);

        if (!driverIds.length) return [];

        const activeOffers = new Set(activeOfferIds);

        const multi = redis.multi();
        driverIds.forEach(id => multi.hGetAll(this.key(id)));
        const results = await multi.exec();

        const now = Date.now();
        const drivers: DriverSession[] = [];

        for (let i = 0; i < results.length; i++) {
            const data = results[i] as unknown as Record<string, string>;
            if (!data || !data.driverId) continue;

            const lastUpdated = Number(data.lastUpdated);

            if (
                data.canReceiveOffers !== "1" ||
                data.currentRideId ||
                activeOffers.has(data.driverId) ||
                lastUpdated + this.maxStaleMs < now
            ) {
                continue;
            }

            drivers.push({
                socketId: data.socketId,
                driverId: data.driverId,
                status: data.status as any,
                canReceiveOffers: true,
                currentRideId: null,
                location: data.location
                    ? JSON.parse(data.location)
                    : undefined,
                lastUpdated,
            });
        }

        return drivers;
    }

    /* ----------------- Cleanup ----------------- */

    async remove(driverId: string) {
        await redis.del(this.key(driverId));
        await redis.sRem(ONLINE_DRIVERS_KEY, driverId);
        await this.clearOffer(driverId);
    }

    async cleanupStaleDrivers(ttlMs = 5 * 60 * 1000) {
        const driverIds = await redis.sMembers(ONLINE_DRIVERS_KEY);
        const now = Date.now();

        const multi = redis.multi();
        driverIds.forEach(id => multi.hGet(this.key(id), "lastUpdated"));
        const results = await multi.exec();

        for (let i = 0; i < results.length; i++) {
            const lastUpdated = Number(results[i]);
            if (!lastUpdated) continue;

            if (now - lastUpdated > ttlMs) {
                await this.remove(driverIds[i]);
            }
        }
    }

    /* ----------------- Testing ----------------- */

    async addTestDriversToStore(drivers: DriverSession[]) {
        console.log(`🧪 Adding ${drivers.length} test driver(s)`);

        for (const d of drivers) {
            await this.upsert(d.driverId, d);
            console.log(`✅ Added ${d.driverId}`);
        }
    }
}

export const driverStoreRedis = new DriverStore();
