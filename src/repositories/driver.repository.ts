import { DriverSession, driverStore } from "../store/driverStore";
import { driverStoreRedis } from "../store/driverStoreRedis";
import { haversineDistanceKm } from "../utils/haversine";

export const DriverRepository = {
    async findAvailableDrivers(pickupLat: number, pickupLon: number, maxKm = 2) {
        const onlineDrivers = await driverStoreRedis.getOnlineDrivers();

        console.log(onlineDrivers);


        const driversWithDistance = onlineDrivers
            .map((driver) => {
                if (!driver.location) return null;

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
    }
};
