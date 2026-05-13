import { Request, Response } from "express";
import { getDiscountConfig } from "../models/DiscountConfigModel";

/**
 * GET /discount/config
 *
 * Public endpoint consumed by both the driver and passenger apps. They use the
 * returned tiers to compute the discount locally against the live taximeter
 * fare so the strikethrough/discounted UI stays in sync without an extra round
 * trip per ride.
 */
export const fetchDiscountConfig = async (_req: Request, res: Response) => {
    try {
        const doc = await getDiscountConfig();
        return res.json({
            enabled: doc.enabled,
            tiers: doc.tiers ?? [],
        });
    } catch (err: any) {
        return res.status(500).json({
            error: err?.message ?? "Failed to fetch discount config",
        });
    }
};
