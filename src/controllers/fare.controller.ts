// src/controllers/fareController.ts
import { Request, Response } from "express";
import { getFareByCity, getFareByCityNew } from "../services/fare.service";
import { AuthRequest } from "../middlewares/auth";
import { DriverModel } from "../models/DriverModel";
import { WorkingAreaService } from "../services/working.area.service";
import { driverStoreRedis } from "../store/driverStoreRedis";

const service = new WorkingAreaService();

export const fetchFareConfig = async (req: AuthRequest, res: Response) => {
    try {
        const cityId = req.params.cityId || "default";
        const driverId = req.driverId;
        if (!driverId) {
            return res.status(404).json({ message: "Driver id is required" });
        }

        const enabledServices = await driverStoreRedis.getEnabledServices(driverId);
        const isPremium = await driverStoreRedis.hasPremiumCar(driverId);

        const fare = await getFareByCity(cityId, isPremium);

        fare.enabledServices = enabledServices;
        return res.json({
            success: true,
            fare,
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch fare configuration",
        });
    }
};

export const fetchFareConfigNew = async (req: AuthRequest, res: Response) => {
    try {
        const { rideType, cityId } = req.body;
        const driverId = req.driverId;
        if (!driverId) {
            return res.status(404).json({ message: "Driver id is required" });
        }

        const fare = await getFareByCityNew(rideType);

        return res.json({
            success: true,
            fare,
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch fare configuration",
        });
    }
};

export const fetchWorkingAreas = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.driverId;
        console.log(driverId);

        const driver = await DriverModel.findById(driverId)

        if (!driver) {
            return res.status(404).json({ message: "Driver not found" });
        }

        const areas = await service.getAll();

        return res.json({
            success: true,
            areas,
        });

    } catch (error: any) {
        console.error('❌ Error fetching working areas:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch working areas',
        });
    }
};

