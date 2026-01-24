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
    hasPremiumCar?: boolean;
    canReceiveOffers: boolean;
    enabledServices?: string[],
}

// Redis keys
const DRIVER_KEY_PREFIX = "driver:";
const ACTIVE_OFFERS_KEY = "activeOffers";
const ONLINE_DRIVERS_KEY = "onlineDrivers";
const ENABLED_SERVICES_KEY = "enabledServices";


export class DriverStore {
    private maxStaleMs = 2 * 60 * 1000;

    private key(driverId: string) {
        return DRIVER_KEY_PREFIX + driverId;
    }

    /* ----------------- Availability ----------------- */

    async isAvailable(driverId: string): Promise<boolean> {
        return !(await redis.sIsMember(ACTIVE_OFFERS_KEY, driverId));
    }

    /* ----------------- Premium Availability ----------------- */

    async hasAvailablePremiumDriver(): Promise<boolean> {
        const [driverIds, activeOfferIds] = await Promise.all([
            redis.sMembers(ONLINE_DRIVERS_KEY),
            redis.sMembers(ACTIVE_OFFERS_KEY),
        ]);

        if (!driverIds.length) return false;

        const activeOffers = new Set(activeOfferIds);
        const now = Date.now();

        const multi = redis.multi();
        driverIds.forEach(id => multi.hGetAll(this.key(id)));
        const results = await multi.exec();

        for (let i = 0; i < results.length; i++) {
            const data = results[i] as unknown as Record<string, string>;
            if (!data || !data.driverId) continue;

            const lastUpdated = Number(data.lastUpdated);

            const hasPremiumCar = data.hasPremiumCar === "1";
            const canReceiveOffers = data.canReceiveOffers === "1";
            const currentRideId = data.currentRideId; // empty string means no ride
            const isStale = lastUpdated + this.maxStaleMs < now;

            if (
                !canReceiveOffers ||
                !hasPremiumCar ||
                !!currentRideId || // not empty -> currently in ride
                activeOffers.has(data.driverId) ||
                isStale
            ) {
                continue;
            }

            return true; // found at least one valid premium driver
        }

        return false;
    }


    async hasPremiumCar(driverId: string): Promise<boolean> {
        const data = await redis.hGetAll(this.key(driverId));
        if (!data || !data.driverId) return false;

        return data.hasPremiumCar === "1";
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

        if (data.hasPremiumCar !== undefined) {
            hash.hasPremiumCar = data.hasPremiumCar ? "1" : "0";
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

            const enabledServices = await this.getEnabledServices(data.driverId);

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
                hasPremiumCar: data.hasPremiumCar === "1",
                enabledServices: enabledServices,
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


    /**
 * Add a service to enabledServices:
 * - if serviceId exists -> do nothing
 * - if not -> add it
 *
 * Stored in redis as JSON string array in the driver hash.
 */
    async addEnabledService(driverId: string, serviceId: string): Promise<string[]> {
        const key = this.key(driverId);

        await redis.watch(key);

        try {
            const currentRaw = await redis.hGet(key, ENABLED_SERVICES_KEY);

            let enabled: string[] = [];
            if (currentRaw) {
                try {
                    enabled = JSON.parse(currentRaw);
                    if (!Array.isArray(enabled)) enabled = [];
                } catch {
                    enabled = [];
                }
            }

            // already enabled -> no update needed
            if (enabled.includes(serviceId)) {
                await redis.unwatch();
                return enabled;
            }

            const updated = [...enabled, serviceId];

            const tx = redis.multi();
            tx.hSet(key, {
                [ENABLED_SERVICES_KEY]: JSON.stringify(updated),
                lastUpdated: Date.now().toString(),
            });

            const res = await tx.exec();

            // retry on conflict
            if (res === null) {
                return this.addEnabledService(driverId, serviceId);
            }

            return updated;
        } finally {
            await redis.unwatch();
        }
    }


    /**
 * Toggle a service in enabledServices:
 * - if serviceId exists -> remove it
 * - if not -> add it
 *
 * Stored in redis as JSON string array in the driver hash.
 */
    async toggleEnabledService(driverId: string, serviceId: string): Promise<string[]> {
        const key = this.key(driverId);

        // watch to avoid race conditions
        await redis.watch(key);

        try {
            const currentRaw = await redis.hGet(key, ENABLED_SERVICES_KEY);

            let enabled: string[] = [];
            if (currentRaw) {
                try {
                    enabled = JSON.parse(currentRaw);
                    if (!Array.isArray(enabled)) enabled = [];
                } catch {
                    enabled = [];
                }
            }

            const set = new Set(enabled);

            if (set.has(serviceId)) {
                set.delete(serviceId);
            } else {
                set.add(serviceId);
            }

            const updated = Array.from(set);

            const tx = redis.multi();
            tx.hSet(key, {
                [ENABLED_SERVICES_KEY]: JSON.stringify(updated),
                lastUpdated: Date.now().toString(),
            });

            const res = await tx.exec();

            // if null => watch conflict, retry
            if (res === null) {
                return this.toggleEnabledService(driverId, serviceId);
            }

            return updated;
        } finally {
            await redis.unwatch();
        }
    }

    /** Optional: read enabled services */
    async getEnabledServices(driverId: string): Promise<string[]> {
        const raw = await redis.hGet(this.key(driverId), ENABLED_SERVICES_KEY);
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
}

export const driverStoreRedis = new DriverStore();
