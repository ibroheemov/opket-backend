import { redis } from "../redis/redisClient";
import { UpdateLocationBody } from "../types/driver.types";
import { DriverLocation } from "../types/location";

export interface DriverSession {
    driverId: string;
    socketId: string;
    status: "online" | "offline";
    currentRideId?: string | null;
    location?: DriverLocation;
    lastUpdated: number;
    enabledServices?: string[],
}

export type PendingEvent = {
    event: string;
    data: any;
    createdAt: number;
};

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

    async clearCurrentRide(driverId: string) {
        await redis.hSet(this.key(driverId), { currentRideId: "" });
    }

    async getDriverLocation(driverId: string): Promise<DriverLocation | null> {
        const data = await redis.hmGet(this.key(driverId), [
            "location",
            "lastUpdated",
        ]);

        const [locationRaw, lastUpdatedRaw] = data;

        if (!locationRaw) return null;

        // Optional: protect against stale location
        const lastUpdated = Number(lastUpdatedRaw);
        const now = Date.now();

        if (!lastUpdated || lastUpdated + this.maxStaleMs < now) {
            return null; // stale location
        }

        try {
            return JSON.parse(locationRaw);
        } catch {
            return null;
        }
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

    async updateLocation(data: UpdateLocationBody) {
        // const { lat, lon, bearing, driverId } = data;
        // const enabledServices = await this.getEnabledServices(driverId);

        // await redis.hSet(this.key(driverId), {
        //     location: JSON.stringify({ lon, lat, bearing }),
        //     lastUpdated: Date.now().toString(),
        // });

        // const multi = redis.multi();

        // // remove old
        // multi.zRem("drivers:geo:premium", driverId);
        // multi.zRem("drivers:geo:comfort", driverId);

        // // always add to main
        // multi.geoAdd("drivers:geo", {
        //     longitude: lon,
        //     latitude: lat,
        //     member: driverId,
        // });

        // // premium
        // if (enabledServices.includes("premium")) {
        //     multi.geoAdd("drivers:geo:premium", {
        //         longitude: lon,
        //         latitude: lat,
        //         member: driverId,
        //     });

        //     // premium can also accept comfort
        //     multi.geoAdd("drivers:geo:comfort", {
        //         longitude: lon,
        //         latitude: lat,
        //         member: driverId,
        //     });
        // }

        // // comfort
        // else if (enabledServices.includes("comfort")) {
        //     multi.geoAdd("drivers:geo:comfort", {
        //         longitude: lon,
        //         latitude: lat,
        //         member: driverId,
        //     });
        // }

        // await multi.exec();
    }

    /* ----------------- Reads ----------------- */

    async get(driverId: string): Promise<DriverSession | null> {
        const data = await redis.hGetAll(this.key(driverId));
        if (!Object.keys(data).length) return null;

        return {
            socketId: data.socketId,
            driverId: data.driverId,
            status: data.status as any,
            currentRideId: data.currentRideId || null,
            location: data.location ? JSON.parse(data.location) : undefined,
            lastUpdated: Number(data.lastUpdated),
        };
    }

    /* ----------------- Cleanup ----------------- */

    async remove(driverId: string) {
        await redis.del(this.key(driverId));
        await redis.sRem(ONLINE_DRIVERS_KEY, driverId);
        await redis.zRem("drivers:geo", driverId); // IMPORTANT
        await this.clearOffer(driverId);
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

    getGeoIndexFromOptions(options: string[]): string {
        if (options.includes("premium")) {
            return "drivers:geo:premium";
        }

        if (options.includes("comfort")) {
            return "drivers:geo:comfort";
        }

        return "drivers:geo"; // default = standard
    }

    async filterAvailableDrivers(
        ids: string[]
    ): Promise<{ driverId: string }[]> {
        const now = Date.now();

        if (!ids.length) return [];

        const multi = redis.multi();
        ids.forEach(id => multi.hmGet(this.key(id), [
            "driverId",
            "canReceiveOffers",
            "currentRideId",
            "lastUpdated",
        ]));

        const sessions = await multi.exec();
        if (!sessions) return [];

        const available: { driverId: string }[] = [];

        for (const raw of sessions) {
            const data = raw as unknown as (string | null)[];

            const driverId = data[0];
            const canReceiveOffers = data[1];
            const currentRideId = data[2];

            if (
                !driverId ||
                canReceiveOffers !== "1" ||
                currentRideId
            ) {
                continue;
            }

            available.push({ driverId });
        }

        return available;
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
