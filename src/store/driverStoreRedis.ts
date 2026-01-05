import { createClient } from "redis";
import { redis } from "../redis/redisClient";
import { DriverLocation } from "../types/location";

export interface DriverSession {
    driverId: string;
    socketId: string;
    status: "online" | "offline";
    socketStatus?: "connected" | "disconnected";
    currentRideId?: string | null;
    location?: DriverLocation;
    lastUpdated: number;
    fcmToken?: string;
    canReceiveOffers: boolean;
}

// Redis keys
const DRIVER_KEY_PREFIX = "driver:";
const ACTIVE_OFFERS_KEY = "activeOffers";
const ONLINE_DRIVERS_KEY = "onlineDrivers";

// // Create Redis client
// const redis = createClient({
//     url: process.env.REDIS_URL || "redis://localhost:6379",
// });

// redis.on("error", (err) => console.error("Redis Client Error", err));

// async function connectRedis() {
//     await redis.connect();
//     console.log("Connected to Redis");
// }

// connectRedis();

export class DriverStore {
    private maxStaleMs = 2 * 60 * 1000; // 2 minutes

    /** Check if driver is available (not in active offers) */
    async isAvailable(driverId: string): Promise<boolean> {
        return !(await redis.sIsMember(ACTIVE_OFFERS_KEY, driverId));
    }

    /** Mark driver as having an active offer */
    async markAsOffered(driverId: string) {
        await redis.sAdd(ACTIVE_OFFERS_KEY, driverId);
    }

    /** Remove driver from active offers */
    async clearOffer(driverId: string) {
        await redis.sRem(ACTIVE_OFFERS_KEY, driverId);
    }

    /** Add or update a driver session */
    async upsert(driverId: string, data: Partial<DriverSession>) {
        const key = DRIVER_KEY_PREFIX + driverId;
        const existingStr = await redis.get(key);
        const existing: DriverSession | null = existingStr ? JSON.parse(existingStr) : null;

        const updated: DriverSession = {
            ...existing,
            driverId,
            ...data,
            lastUpdated: Date.now(),
        } as DriverSession;
        // console.log("CLEAR RIDE", data, updated);


        await redis.set(key, JSON.stringify(updated));

        // Maintain online drivers set
        if (updated.status === "online") {
            await redis.sAdd(ONLINE_DRIVERS_KEY, driverId);
        } else {
            await redis.sRem(ONLINE_DRIVERS_KEY, driverId);
            await this.clearOffer(driverId);
        }
    }

    /** Get a driver session */
    async get(driverId: string): Promise<DriverSession | null> {
        const data = await redis.get(DRIVER_KEY_PREFIX + driverId);
        return data ? JSON.parse(data) : null;
    }

    /** Remove driver on disconnect */
    async remove(driverId: string) {
        await redis.del(DRIVER_KEY_PREFIX + driverId);
        await redis.sRem(ONLINE_DRIVERS_KEY, driverId);
        await this.clearOffer(driverId);
    }

    /** Update driver location */
    async updateLocation(driverId: string, location: DriverLocation) {
        await this.upsert(driverId, { location, lastUpdated: Date.now() });

    }

    /** Get all online drivers efficiently */
    async getOnlineDrivers(): Promise<DriverSession[]> {
        const driverIds = await redis.sMembers(ONLINE_DRIVERS_KEY);
        if (driverIds.length === 0) return [];

        const multi = redis.multi();
        driverIds.forEach(id => multi.get(DRIVER_KEY_PREFIX + id));
        const results = await multi.exec();

        const now = Date.now();
        const onlineDrivers: DriverSession[] = [];

        for (let i = 0; i < results.length; i++) {
            const str = results[i]; // With redis v4, exec() returns array of values
            if (!str) continue;

            const driverJson = str as unknown as string;

            const driver: DriverSession = JSON.parse(driverJson);
            const isOffered = await redis.sIsMember(ACTIVE_OFFERS_KEY, driver.driverId);

            if (
                driver.canReceiveOffers &&
                !driver.currentRideId &&
                !isOffered &&
                driver.lastUpdated + this.maxStaleMs >= now
            ) {
                onlineDrivers.push(driver);
            }
        }

        return onlineDrivers;
    }

    /** Cleanup stale drivers */
    async cleanupStaleDrivers(ttlMs = 1000 * 60 * 5) {
        const driverIds = await redis.sMembers(ONLINE_DRIVERS_KEY);
        const now = Date.now();

        const multi = redis.multi();
        driverIds.forEach(id => multi.get(DRIVER_KEY_PREFIX + id));
        const results = await multi.exec();

        for (let i = 0; i < results.length; i++) {
            const str = results[i];
            if (!str) continue;

            const driverJson = str as unknown as string;

            const driver: DriverSession = JSON.parse(driverJson);
            if (now - driver.lastUpdated > ttlMs) {
                await this.remove(driver.driverId);
            }
        }
    }

    /** Add test drivers to store */
    async addTestDriversToStore(drivers: DriverSession[]) {
        console.log(`🧪 Adding ${drivers.length} test driver(s) to driverStore`);
        for (const driver of drivers) {
            await this.upsert(driver.driverId, driver);
            console.log(`✅ Added test driver ${driver.driverId}`);
        }
    }
}

export const driverStoreRedis = new DriverStore();
