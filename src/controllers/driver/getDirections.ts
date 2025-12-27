import { Router, Request, Response } from "express";
import { getDirectionsService } from "../../services/mapbox.service";

const router = Router();

/**
 * GET /api/directions
 * ?profile=driving
 * ?coordinates=lon1,lat1;lon2,lat2
 */
export const getDirections = async (req: Request, res: Response) => {
    try {
        const profile = (req.query.profile as string) || "driving";
        const coordinates = req.query.coordinates as string;

        if (!coordinates) {
            return res.status(400).json({
                error: "coordinates query param is required",
            });
        }

        const data = await getDirectionsService(
            profile as "driving" | "walking" | "cycling",
            coordinates
        );

        res.json(data);
    } catch (error: any) {
        console.error("Mapbox Directions Error:", error.message);

        res.status(500).json({
            error: "Failed to fetch directions",
        });
    }
};

