import { redis } from "../redis/redisClient";
import { DriverLocation } from "../types/location";

export interface DriverSession {
    driverId: string;
    socketId: string;
    status: "online" | "offline";
    socketStatus?: "connected" | "disconnected";
    currentRideId?: string | null;
    location?: DriverLocation | null;
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
    private static NULL = "__null__";

    private key(driverId: string) {
        return `driver:${driverId}`;
    }

    /* -------------------- helpers -------------------- */

    private encode(value: any) {
        if (value === null || value === undefined) return DriverStore.NULL;
        if (typeof value === "object") return JSON.stringify(value);
        return String(value);
    }

    private decode<T = any>(value: string | null): T | null {
        if (!value || value === DriverStore.NULL) return null;
        try {
            return JSON.parse(value);
        } catch {
            return value as unknown as T;
        }
    }

    private log(
        driverId: string,
        action: string,
        field: string,
        before: any,
        after: any
    ) {
        console.debug(
            `[DriverStore] driver=${driverId} action=${action} field=${field}`,
            { before, after }
        );
    }

    /* -------------------- availability -------------------- */

    async isAvailable(driverId: string) {
        return !(await redis.sIsMember("activeOffers", driverId));
    }

    async markAsOffered(driverId: string) {
        await redis.sAdd("activeOffers", driverId);
    }

    async clearOffer(driverId: string) {
        await redis.sRem("activeOffers", driverId);
    }

    /* -------------------- SAFE UPSERT -------------------- */

    async upsert(
        driverId: string,
        data: Partial<DriverSession>,
        source = "unknown"
    ) {
        const key = this.key(driverId);
        const now = Date.now();

        const multi = redis.multi();

        for (const [field, value] of Object.entries(data)) {
            // DEBUG: read previous value ONLY for logging
            const before = await redis.hGet(key, field);

            this.log(
                driverId,
                source,
                field,
                this.decode(before),
                value
            );

            multi.hSet(key, field, this.encode(value));
        }

        multi.hSet(key, "driverId", driverId);
        multi.hSet(key, "lastUpdated", now.toString());

        await multi.exec();

        // Maintain online drivers set
        if (data.status === "online") {
            await redis.sAdd("onlineDrivers", driverId);
        }

        if (data.status === "offline") {
            await redis.sRem("onlineDrivers", driverId);
            await this.clearOffer(driverId);
        }
    }

    /* -------------------- READ -------------------- */

    async get(driverId: string): Promise<DriverSession | null> {
        const raw = await redis.hGetAll(this.key(driverId));
        if (!raw || Object.keys(raw).length === 0) return null;

        return {
            driverId: raw.driverId,
            socketId: raw.socketId,
            status: raw.status as any,
            socketStatus: raw.socketStatus as any,
            currentRideId: this.decode(raw.currentRideId),
            location: this.decode(raw.location),
            lastUpdated: Number(raw.lastUpdated),
            fcmToken: raw.fcmToken,
            canReceiveOffers: raw.canReceiveOffers === "true",
        };
    }

    /* -------------------- REMOVE -------------------- */

    async remove(driverId: string) {
        await redis.del(this.key(driverId));
        await redis.sRem("onlineDrivers", driverId);
        await this.clearOffer(driverId);
    }

    /* -------------------- LOCATION -------------------- */

    async updateLocation(driverId: string, location: DriverLocation) {
        await this.upsert(
            driverId,
            { location },
            "updateLocation"
        );
    }

    /* -------------------- ONLINE DRIVERS -------------------- */

    async getOnlineDrivers(): Promise<DriverSession[]> {
        const driverIds = await redis.sMembers("onlineDrivers");
        if (!driverIds.length) return [];

        const now = Date.now();
        const drivers: DriverSession[] = [];

        for (const id of driverIds) {
            const driver = await this.get(id);
            if (!driver) continue;

            const isOffered = await redis.sIsMember("activeOffers", id);

            if (
                driver.canReceiveOffers &&
                !driver.currentRideId &&
                !isOffered &&
                driver.lastUpdated + this.maxStaleMs >= now
            ) {
                drivers.push(driver);
            }
        }

        return drivers;
    }

    /* -------------------- CLEANUP -------------------- */

    async cleanupStaleDrivers(ttlMs = 5 * 60 * 1000) {
        const ids = await redis.sMembers("onlineDrivers");
        const now = Date.now();

        for (const id of ids) {
            const driver = await this.get(id);
            if (!driver) continue;

            if (now - driver.lastUpdated > ttlMs) {
                await this.remove(id);
            }
        }
    }
}

export const driverStoreRedis = new DriverStore();
