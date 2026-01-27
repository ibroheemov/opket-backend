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


const TOGGLE_ENABLED_SERVICES_LUA = `
local key = KEYS[1]
local field = ARGV[1]
local serviceId = ARGV[2]
local now = ARGV[3]

local raw = redis.call('HGET', key, field)
local arr = {}

if raw and type(raw) == 'string' then
  local ok, decoded = pcall(cjson.decode, raw)
  if ok and type(decoded) == 'table' then
    arr = decoded
  end
end

local set = {}
for i=1,#arr do
  local v = arr[i]
  if type(v) == 'string' then set[v] = true end
end

if set[serviceId] then
  set[serviceId] = nil
else
  set[serviceId] = true
end

local out = {}
for k,_ in pairs(set) do table.insert(out, k) end

redis.call('HSET', key, field, cjson.encode(out), 'lastUpdated', now)
return cjson.encode(out)
`;

const ADD_ENABLED_SERVICES_LUA = `
local key = KEYS[1]
local field = ARGV[1]
local now = ARGV[2]

-- services start from ARGV[3...]
local raw = redis.call('HGET', key, field)
local arr = {}

if raw and type(raw) == 'string' then
  local ok, decoded = pcall(cjson.decode, raw)
  if ok and type(decoded) == 'table' then
    arr = decoded
  end
end

local set = {}
for i=1,#arr do
  local v = arr[i]
  if type(v) == 'string' then set[v] = true end
end

for i=3,#ARGV do
  local sid = ARGV[i]
  if sid and type(sid) == 'string' and sid ~= '' then
    set[sid] = true
  end
end

local out = {}
for k,_ in pairs(set) do table.insert(out, k) end

redis.call('HSET', key, field, cjson.encode(out), 'lastUpdated', now)
return cjson.encode(out)
`;


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

            console.time(`enabled:${data.driverId}`);
            const enabledServicesRaw = data[ENABLED_SERVICES_KEY];
            let enabledServices: string[] = [];

            if (enabledServicesRaw) {
                try {
                    const parsed = JSON.parse(enabledServicesRaw);
                    enabledServices = Array.isArray(parsed) ? parsed : [];
                } catch {
                    enabledServices = [];
                }
            } console.timeEnd(`enabled:${data.driverId}`);

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


    async toggleEnabledService(driverId: string, serviceId: string): Promise<string[]> {
        const key = this.key(driverId);
        const raw = await redis.eval(TOGGLE_ENABLED_SERVICES_LUA, {
            keys: [key],
            arguments: [ENABLED_SERVICES_KEY, serviceId, Date.now().toString()],
        });

        // raw is JSON string
        return JSON.parse(raw as string) as string[];
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

    async enableServicesForDrivers(driverIds: string[], serviceIds: string[]) {
        if (!driverIds.length) return;
        if (!serviceIds.length) return;

        const now = Date.now().toString();

        // Load once (optional but recommended)
        const sha = await redis.scriptLoad(ADD_ENABLED_SERVICES_LUA);

        const multi = redis.multi();

        for (const driverId of driverIds) {
            const key = this.key(driverId);

            // EVALSHA per driver key (atomic per driver)
            multi.evalSha(sha, {
                keys: [key],
                arguments: [ENABLED_SERVICES_KEY, now, ...serviceIds],
            });
        }

        const results = await multi.exec();

        // results is array of JSON strings (or tool-specific wrappers)
        // If you want: map per driver result
        return driverIds.map((id, i) => {
            const raw = results?.[i] as unknown as string;
            let enabled: string[] = [];
            try { enabled = JSON.parse(raw); } catch { }
            return { driverId: id, enabledServices: enabled };
        });
    }

    async enableServicesForOnlineDrivers(serviceIds: string[]) {
        const driverIds = await redis.sMembers(ONLINE_DRIVERS_KEY);
        return this.enableServicesForDrivers(driverIds, serviceIds);
    }

}

export const driverStoreRedis = new DriverStore();
