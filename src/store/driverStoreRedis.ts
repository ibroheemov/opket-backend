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
    pendingEvents?: PendingEvent[];
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
    // NEW: keep pending events bounded
    private pendingEventsCap = 100;

    private key(driverId: string) {
        return DRIVER_KEY_PREFIX + driverId;
    }

    private pendingKey(driverId: string) {
        return `${DRIVER_KEY_PREFIX}${driverId}:pendingEvents`;
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

    // NEW: push missed event into driver memory (Redis LIST)
    async pushPendingEvent(driverId: string, event: string, data: any) {
        const now = Date.now();
        const payload = JSON.stringify({ event, data, createdAt: now });

        const listKey = this.pendingKey(driverId);
        const driverKey = this.key(driverId);

        // Keep lastUpdated in sync (optional but nice)
        const multi = redis.multi();
        multi.rPush(listKey, payload);
        // cap list size to last N events
        multi.lTrim(listKey, -this.pendingEventsCap, -1);
        multi.hSet(driverKey, { lastUpdated: now.toString() });
        await multi.exec();
    }

    // NEW: pop & clear all pending events (use when driver reconnects)
    async flushPendingEvents(driverId: string): Promise<PendingEvent[]> {
        const listKey = this.pendingKey(driverId);
        const driverKey = this.key(driverId);

        // Atomic-ish: LRANGE + DEL in one MULTI transaction
        const multi = redis.multi();
        multi.lRange(listKey, 0, -1);
        multi.del(listKey);
        multi.hSet(driverKey, { lastUpdated: Date.now().toString() });

        const res = await multi.exec();
        // res[0] should be the LRANGE result
        const raw = (res?.[0] ?? []) as unknown as string[];

        const events: PendingEvent[] = [];
        for (const s of raw) {
            try {
                const parsed = JSON.parse(s);
                if (parsed?.event && typeof parsed.createdAt === "number") {
                    events.push(parsed);
                }
            } catch {
                // ignore malformed items
            }
        }

        return events;
    }

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

    async updateLocation(driverId: string,
        lon: number,
        lat: number,
        bearing: number
    ) {
        const enabledServices = await this.getEnabledServices(driverId);

        await redis.hSet(this.key(driverId), {
            location: JSON.stringify({ lon, lat, bearing }),
            lastUpdated: Date.now().toString(),
        });

        const multi = redis.multi();

        // remove old
        multi.zRem("drivers:geo:premium", driverId);
        multi.zRem("drivers:geo:comfort", driverId);

        // always add to main
        multi.geoAdd("drivers:geo", {
            longitude: lon,
            latitude: lat,
            member: driverId,
        });

        // premium
        if (enabledServices.includes("premium")) {
            multi.geoAdd("drivers:geo:premium", {
                longitude: lon,
                latitude: lat,
                member: driverId,
            });

            // premium can also accept comfort
            multi.geoAdd("drivers:geo:comfort", {
                longitude: lon,
                latitude: lat,
                member: driverId,
            });
        }

        // comfort
        else if (enabledServices.includes("comfort")) {
            multi.geoAdd("drivers:geo:comfort", {
                longitude: lon,
                latitude: lat,
                member: driverId,
            });
        }

        await multi.exec();
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
        await redis.zRem("drivers:geo", driverId); // IMPORTANT
        await redis.del(this.pendingKey(driverId));
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
            const lastUpdated = Number(data[3]);

            if (
                !driverId ||
                canReceiveOffers !== "1" ||
                currentRideId
                // || lastUpdated + this.maxStaleMs < now  // optional stale check
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

    async isSocketConnected(driverId: string): Promise<boolean> {
        const data = await redis.hmGet(
            this.key(driverId),
            "socketStatus",
        );

        const [socketStatus] = data;

        return socketStatus === "connected";
    }
}

export const driverStoreRedis = new DriverStore();
