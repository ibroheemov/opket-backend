import { Response } from "express";
import { AuthRequest } from "../../middlewares/auth";
import { PassengerModel } from "../../models/PassengerModel";

export const reportPassengerInfo = async (req: AuthRequest, res: Response) => {
    try {
        const { appVersion, notificationEnabled } = req.body ?? {};

        const updateData: Record<string, unknown> = {};

        if (typeof appVersion === "string" && appVersion.length > 0) {
            updateData.appVersion = appVersion;
        }
        if (typeof notificationEnabled === "boolean") {
            updateData.notificationEnabled = notificationEnabled;
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ ok: false, error: "No fields to update" });
        }

        await PassengerModel.findByIdAndUpdate(req.id, updateData);
        return res.json({ ok: true });
    } catch (err: any) {
        console.error("reportPassengerInfo error:", err);
        return res.status(500).json({ ok: false, error: err?.message ?? "Server error" });
    }
};
