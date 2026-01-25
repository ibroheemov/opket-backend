import { Request, Response } from "express";
import { driverStoreRedis } from "../store/driverStoreRedis";

const DEFAULT_SERVICE_IDS = [
    "bagaj",
    "dostavka",
    "tomida_bagaj",
    "peregruz_1_kishi",
    "peregruz_2_kishi",
    "peremichka",
    "nasos_xizmati",
    "gaz_otkazish",
    "buksir",
    "peregon",
    "uzoq_zakazga",
    "platnye_stoyanki",
    "zapaska_balon",
] as const;

export const enableServices = async (req: Request, res: Response) => {
    try {
        // Allow overriding services from request body, otherwise use defaults
        const serviceIds: string[] =
            Array.isArray(req.body?.serviceIds) && req.body.serviceIds.length > 0
                ? req.body.serviceIds
                : [...DEFAULT_SERVICE_IDS];

        // IMPORTANT: await it
        const result = await driverStoreRedis.enableServicesForOnlineDrivers(serviceIds);

        // result might be undefined if your store method doesn't return anything
        // (in my earlier version it returns [{driverId, enabledServices}] )
        res.status(200).json({
            ok: true,
            scope: "onlineDrivers",
            serviceIds,
            updatedDrivers: Array.isArray(result) ? result.length : undefined,
            result, // you can remove this if it’s too verbose
        });
    } catch (err) {
        console.error("enableServices error:", err);
        res.status(500).json({
            ok: false,
            error: "Server error",
        });
    }
};
