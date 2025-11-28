import { DriverModel, IDriverDocument } from "../models/DriverModel";
import { DriverSession, driverStore } from "../store/driverStore";
import { haversineDistanceKm } from "../utils/haversine";

export const DriverRepository = {
    async findAvailableDrivers(pickupLat: number, pickupLon: number, maxKm = 5) {
        const onlineDrivers = driverStore.getOnlineDrivers();

        console.log(`Online drivers: ${onlineDrivers.length}`);


        const driversWithDistance = onlineDrivers
            .map((driver) => {
                if (!driver.location) return null;

                let dist = haversineDistanceKm(
                    pickupLat,
                    pickupLon,
                    driver.location.lat,
                    driver.location.lon
                );

                dist = 3;

                if (dist > maxKm) return null;

                return { driver, distKm: dist };
            })
            .filter(Boolean) as { driver: DriverSession; distKm: number }[];

        // sort nearest → farthest
        driversWithDistance.sort((a, b) => a.distKm - b.distKm);

        return driversWithDistance;
    }
};
