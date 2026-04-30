import { redis } from "../redis/redisClient";
import { UpdateLocationBody } from "../types/driver.types";

const LOCATION_STANDARD_KEY = "drivers:geo:standard";
const LOCATION_COMFORT_KEY = "drivers:geo:comfort";

type GeoType = string | "standard" | "comfort";

export class DriverLocationStore {

    private getKeys(type: GeoType): string[] {
        switch (type) {
            case "comfort":
                // Comfort drivers belong to both groups
                return [
                    LOCATION_STANDARD_KEY,
                    LOCATION_COMFORT_KEY
                ];

            case "standard":
            default:
                return [LOCATION_STANDARD_KEY];
        }
    }

    async removeDriver(driverId: string) {
        const multi = redis.multi();

        // Remove from all geo indexes regardless of type
        // safer than looking up geoType first
        multi.zRem(LOCATION_STANDARD_KEY, driverId);
        multi.zRem(LOCATION_COMFORT_KEY, driverId);

        await multi.exec();
    }

    async updateLocation({
        driverId,
        latitude,
        longitude,
        geoType,
    }: {
        driverId: string;
        latitude: number;
        longitude: number;
        geoType: GeoType;
    }) {
        const now = Date.now();

        const geoData = {
            longitude,
            latitude,
            member: driverId,
        };

        const multi = redis.multi();

        // Update last known location
        multi.hSet(`driver:${driverId}`, {
            location: JSON.stringify({ latitude, longitude }),
            lastUpdated: now.toString(),
        });

        // Remove from all indexes first
        multi.zRem(LOCATION_STANDARD_KEY, driverId);
        multi.zRem(LOCATION_COMFORT_KEY, driverId);

        // Add to all eligible indexes
        for (const key of this.getKeys(geoType)) {
            multi.geoAdd(key, geoData);
        }

        await multi.exec();
    }
}

export const driverLocationStore = new DriverLocationStore();