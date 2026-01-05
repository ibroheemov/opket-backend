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

// export class DriverStore {
//     private maxStaleMs = 2 * 60 * 1000; // 2 minutes

//     /** Check if driver is available (not in active offers) */
//     async isAvailable(driverId: string): Promise<boolean> {
//         return !(await redis.sIsMember(ACTIVE_OFFERS_KEY, driverId));
//     }

//     /** Mark driver as having an active offer */
//     async markAsOffered(driverId: string) {
//         await redis.sAdd(ACTIVE_OFFERS_KEY, driverId);
//     }

//     /** Remove driver from active offers */
//     async clearOffer(driverId: string) {
//         await redis.sRem(ACTIVE_OFFERS_KEY, driverId);
//     }

//     /** Add or update a driver session */
//     async upsert(driverId: string, data: Partial<DriverSession>) {
//         const key = DRIVER_KEY_PREFIX + driverId;
//         const existingStr = await redis.get(key);
//         const existing: DriverSession | null = existingStr ? JSON.parse(existingStr) : null;

//         const updated: DriverSession = {
//             ...existing,
//             driverId,
//             ...data,
//             lastUpdated: Date.now(),
//         } as DriverSession;
//         // console.log("CLEAR RIDE", data, updated);


//         await redis.set(key, JSON.stringify(updated));

//         // Maintain online drivers set
//         if (updated.status === "online") {
//             await redis.sAdd(ONLINE_DRIVERS_KEY, driverId);
//         } else {
//             await redis.sRem(ONLINE_DRIVERS_KEY, driverId);
//             await this.clearOffer(driverId);
//         }
//     }

//     /** Get a driver session */
//     async get(driverId: string): Promise<DriverSession | null> {
//         const data = await redis.get(DRIVER_KEY_PREFIX + driverId);
//         return data ? JSON.parse(data) : null;
//     }

//     /** Remove driver on disconnect */
//     async remove(driverId: string) {
//         await redis.del(DRIVER_KEY_PREFIX + driverId);
//         await redis.sRem(ONLINE_DRIVERS_KEY, driverId);
//         await this.clearOffer(driverId);
//     }

//     /** Update driver location */
//     async updateLocation(driverId: string, location: DriverLocation) {
//         await this.upsert(driverId, { location, lastUpdated: Date.now() });

//     }

//     /** Get all online drivers efficiently */
//     async getOnlineDrivers(): Promise<DriverSession[]> {
//         const driverIds = await redis.sMembers(ONLINE_DRIVERS_KEY);
//         if (driverIds.length === 0) return [];

//         const multi = redis.multi();
//         driverIds.forEach(id => multi.get(DRIVER_KEY_PREFIX + id));
//         const results = await multi.exec();

//         const now = Date.now();
//         const onlineDrivers: DriverSession[] = [];

//         for (let i = 0; i < results.length; i++) {
//             const str = results[i]; // With redis v4, exec() returns array of values
//             if (!str) continue;

//             const driverJson = str as unknown as string;

//             const driver: DriverSession = JSON.parse(driverJson);
//             const isOffered = await redis.sIsMember(ACTIVE_OFFERS_KEY, driver.driverId);

//             if (
//                 driver.canReceiveOffers &&
//                 !driver.currentRideId &&
//                 !isOffered &&
//                 driver.lastUpdated + this.maxStaleMs >= now
//             ) {
//                 onlineDrivers.push(driver);
//             }
//         }

//         return onlineDrivers;
//     }

//     /** Cleanup stale drivers */
//     async cleanupStaleDrivers(ttlMs = 1000 * 60 * 5) {
//         const driverIds = await redis.sMembers(ONLINE_DRIVERS_KEY);
//         const now = Date.now();

//         const multi = redis.multi();
//         driverIds.forEach(id => multi.get(DRIVER_KEY_PREFIX + id));
//         const results = await multi.exec();

//         for (let i = 0; i < results.length; i++) {
//             const str = results[i];
//             if (!str) continue;

//             const driverJson = str as unknown as string;

//             const driver: DriverSession = JSON.parse(driverJson);
//             if (now - driver.lastUpdated > ttlMs) {
//                 await this.remove(driver.driverId);
//             }
//         }
//     }

//     /** Add test drivers to store */
//     async addTestDriversToStore(drivers: DriverSession[]) {
//         console.log(`🧪 Adding ${drivers.length} test driver(s) to driverStore`);
//         for (const driver of drivers) {
//             await this.upsert(driver.driverId, driver);
//             console.log(`✅ Added test driver ${driver.driverId}`);
//         }
//     }
// }

// export const driverStoreRedis = new DriverStore();

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
        const driverIds = await redis.sMembers(ONLINE_DRIVERS_KEY);
        if (!driverIds.length) return [];

        const multi = redis.multi();
        driverIds.forEach(id => multi.hGetAll(this.key(id)));
        const results = await multi.exec();

        const now = Date.now();
        const drivers: DriverSession[] = [];

        for (let i = 0; i < results.length; i++) {
            const data = results[i] as unknown as Record<string, string>;
            if (!data || !data.driverId) continue;

            const isOffered = await redis.sIsMember(
                ACTIVE_OFFERS_KEY,
                data.driverId
            );

            const lastUpdated = Number(data.lastUpdated);

            if (
                data.canReceiveOffers === "1" &&
                !data.currentRideId &&
                !isOffered &&
                lastUpdated + this.maxStaleMs >= now
            ) {
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
