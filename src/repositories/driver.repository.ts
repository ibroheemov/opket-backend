import { redis } from "../redis/redisClient";
import { driverSessionStore } from "../store/driver.session.store";
import { DriverSession } from "../store/driverStore";
import { driverStoreRedis } from "../store/driverStoreRedis";
import { DriverRedisKeys } from "../utils/enums";
import { haversineDistanceKm } from "../utils/haversine";

const filterDriversLua = `
-- KEYS:
-- 1 = drivers:available
-- 2..N = capability sets

local availableKey = KEYS[1]
local result = {}

for i = 1, #ARGV do
    local driverId = ARGV[i]

    if redis.call("SISMEMBER", availableKey, driverId) == 1 then

        local ok = true

        for j = 2, #KEYS do
            if redis.call("SISMEMBER", KEYS[j], driverId) == 0 then
                ok = false
                break
            end
        end

        if ok then
            table.insert(result, driverId)
        end
    end
end

return result
`;


export const DriverRepository = {
    async findAvailableDriversNew(
        pickupLat: number,
        pickupLon: number,
        radiusKm: number,
        options: string[],
        limit = 50
    ) {
        const filterDriversSha = await redis.scriptLoad(filterDriversLua);

        // 1️⃣ GEO index
        const geoIndex = options.includes("comfort")
            ? "drivers:geo:comfort"
            : "drivers:geo:standard";

        // 2️⃣ GEO search
        const rawReply = await redis.sendCommand([
            "GEORADIUS",
            geoIndex,
            pickupLon.toString(),
            pickupLat.toString(),
            radiusKm.toString(),
            "km",
            "WITHDIST",
            "WITHCOORD",
            "ASC",
            "COUNT",
            limit.toString()
        ]);
        if (!Array.isArray(rawReply) || rawReply.length === 0) {
            return [];
        }

        const raw = rawReply as any[];

        const driverIds = raw.map(r => r[0]);

        // 3️⃣ Build KEYS (availability + capabilities)
        const capabilityKeys = options
            .filter(o => o !== "comfort" && o !== "standard")
            .map(o => `drivers:capability:${o}`);

        const keys = [
            DriverRedisKeys.AVAILABLE_DRIVERS,
            ...capabilityKeys
        ];

        const result = await redis.evalSha(
            filterDriversSha,
            {
                keys,
                arguments: driverIds
            }
        );


        if (!Array.isArray(result)) {
            return [];
        }

        const filteredIds: string[] = result
            .filter((x): x is string => typeof x === "string");

        const filteredSet = new Set(filteredIds);

        // 5️⃣ Final mapping (ONLY formatting, no filtering)
        return raw
            .filter(r => filteredSet.has(r[0]))
            .map(r => ({
                driverId: r[0],
                distKm: Number(r[1]),
                longitude: Number(r[2][0]),
                latitude: Number(r[2][1]),
            }));
    }
};