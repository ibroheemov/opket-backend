import { Request, Response } from "express";
import { WorkingAreaModel } from "../models/WorkingAreaModel";

export const createWorkingArea = async (req: Request, res: Response) => {
    try {
        const { name, polygon, fareMultiplierOutside } = req.body;

        if (!name || !polygon || polygon.length < 3) {
            return res.status(400).json({ error: 'Invalid area data' });
        }

        const area = new WorkingAreaModel({ name, polygon, fareMultiplierOutside });
        await area.save();

        res.status(201).json(area);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

export const updateWorkingArea = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const area = await WorkingAreaModel.findByIdAndUpdate(id, updates, { new: true });
        if (!area) return res.status(404).json({ error: 'Area not found' });

        res.json(area);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

export const deleteWorkingArea = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const area = await WorkingAreaModel.findByIdAndDelete(id);
        if (!area) return res.status(404).json({ error: 'Area not found' });

        res.json({ message: 'Deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};



