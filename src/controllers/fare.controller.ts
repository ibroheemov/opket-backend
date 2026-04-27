// src/controllers/fareController.ts
import { Request, Response } from "express";
import { getFareByCity, getFareByCityNew } from "../services/fare.service";
import { AuthRequest } from "../middlewares/auth";
import { DriverModel } from "../models/DriverModel";
import { WorkingAreaService } from "../services/working.area.service";
import { driverStoreRedis } from "../store/driverStoreRedis";
import { FareConfigModel } from "../models/FareConfigModel";

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
        // const driverId = req.driverId;
        // console.log(driverId);

        // const driver = await DriverModel.findById(driverId)

        // if (!driver) {
        //     return res.status(404).json({ message: "Driver not found" });
        // }

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

// CRUD
export const createFare = async (req: Request, res: Response) => {
    try {
        const service = new FareConfigModel(req.body);
        const saved = await service.save();
        res.status(201).json(saved);
    } catch (error) {
        res.status(400).json({ error });
    }
};

export const getFares = async (req: Request, res: Response) => {
    try {
        const services = await FareConfigModel.find();
        res.json(services);
    } catch (error) {
        res.status(500).json({ error });
    }
};

export const getFareByType = async (req: Request, res: Response) => {
    try {
        const service = await FareConfigModel.findOne({ type: req.params.type });
        if (!service) return res.status(404).json({ message: "Not found" });
        res.json(service);
    } catch (error) {
        res.status(500).json({ error });
    }
};

export const updateFare = async (req: Request, res: Response) => {
    try {
        const updated = await FareConfigModel.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!updated) return res.status(404).json({ message: "Not found" });

        res.json(updated);
    } catch (error) {
        res.status(400).json({ error });
    }
};


export const deleteFare = async (req: Request, res: Response) => {
    try {
        const deleted = await FareConfigModel.findByIdAndDelete(req.params.id);

        if (!deleted) return res.status(404).json({ message: "Not found" });

        res.json({ message: "Deleted successfully" });
    } catch (error) {
        res.status(500).json({ error });
    }
};