import { redis } from "../redis/redisClient";
import { DriverSession, driverStore } from "../store/driverStore";
import { driverStoreRedis } from "../store/driverStoreRedis";
import { haversineDistanceKm } from "../utils/haversine";

export const DriverRepository = {
    async findAvailableDrivers(
        pickupLat: number,
        pickupLon: number,
        maxKm = 2,
        options: string[],
    ) {
        const onlineDrivers = await driverStoreRedis.getOnlineDrivers();

        const driversWithDistance = onlineDrivers
            .map((driver) => {
                if (!driver.location) return null;
                // if options are required, driver must have enabledServices and contain them
                if (options.length !== 0) {
                    const enabled = driver.enabledServices ?? [];

                    const hasAllOptions = options.every((opt) => enabled.includes(opt));
                    if (!hasAllOptions) return null;
                }

                let dist = haversineDistanceKm(
                    pickupLat,
                    pickupLon,
                    driver.location.lat,
                    driver.location.lon
                );
                if (dist > maxKm) return null;

                return { driver, distKm: dist };
            })
            .filter(Boolean) as { driver: DriverSession; distKm: number }[];

        // sort nearest → farthest
        driversWithDistance.sort((a, b) => a.distKm - b.distKm);

        return driversWithDistance;
    },


    async findAvailableDriversNew(
        pickupLat: number,
        pickupLon: number,
        maxKm = 2,
        options: string[]
    ) {
        const nearbyDriverIds = await redis.geoSearch(
            "drivers:geo",
            {
                longitude: pickupLon,
                latitude: pickupLat,
            },
            {
                radius: maxKm,
                unit: "km",
            }
        );

        if (!nearbyDriverIds.length) return [];

        // Now fetch only nearby drivers
        const multi = redis.multi();
        nearbyDriverIds.forEach((id) => multi.hGetAll(`driver:${id}`));
        const results = await multi.exec();

        // Then apply filters like you already do
    }
};
