import { redis } from "../redis/redisClient";
import { DriverSession, driverStore } from "../store/driverStore";
import { driverStoreRedis } from "../store/driverStoreRedis";
import { supabase } from "../supabase/supabase";
import { Driver } from "../types/driver.types";
import { haversineDistanceKm } from "../utils/haversine";

export const DriverRepository = {
    async findByPhone(phone: string): Promise<Driver | null> {
        const { data, error } = await supabase
            .from("drivers")
            .select("*")
            .eq("phone", phone)
            .maybeSingle();

        if (error) throw error;
        return data;
    },

    async create(driver: Partial<Driver>): Promise<Driver> {
        const { data, error } = await supabase
            .from("drivers")
            .insert(driver)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async update(id: string, updates: Partial<Driver>): Promise<Driver> {
        const { data, error } = await supabase
            .from("drivers")
            .update(updates)
            .eq("id", id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

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
        radiusKm: number,
        options: string[],
        limit = 50
    ): Promise<{ driverId: string; distKm: number; lon: number, lat: number }[]> {
        const geoIndex = driverStoreRedis.getGeoIndexFromOptions(options);

        const raw = await redis.sendCommand([
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


        if (!Array.isArray(raw) || raw.length === 0) {
            return [];
        }

        const availableDrivers = await driverStoreRedis.filterAvailableDrivers(
            raw.map(r => r[0]) // just driver IDs
        );

        const availableSet = new Set(availableDrivers.map(d => d.driverId));

        const final = raw
            .filter(r => availableSet.has(r[0]))
            .map(r => ({
                driverId: r[0],
                distKm: Number(r[1]),
                lon: Number(r[2][0]),
                lat: Number(r[2][1]),
            }));

        return final;
    }
};
