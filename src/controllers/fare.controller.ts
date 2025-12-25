// src/controllers/fareController.ts
import { Request, Response } from "express";
import { getFareByCity } from "../services/fare.service";
import { AuthRequest } from "../middlewares/auth";
import { DriverModel } from "../models/DriverModel";
import { WorkingAreaService } from "../services/working.area.service";

const service = new WorkingAreaService();

export const fetchFareConfig = async (req: Request, res: Response) => {
    try {
        const cityId = req.params.cityId || "default";

        const fare = await getFareByCity(cityId);

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

