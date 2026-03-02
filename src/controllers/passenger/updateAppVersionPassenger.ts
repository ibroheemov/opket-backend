import { Request, Response } from "express";
import { PassengerModel } from "../../models/PassengerModel";

export const updateAppVersionPassenger = async (req: Request, res: Response) => {
    try {
        const { notificationEnabled, version } = req.body;
        const phone = req.params.phone;

        // 1️⃣ Validate phone
        if (!phone) {
            return res.status(401).json({
                success: false,
                message: "unauthorized",
            });
        }

        // 2️⃣ Build update object dynamically
        const updateData: any = {};

        if (version) {
            if (typeof version !== "string") {
                return res.status(400).json({
                    success: false,
                    message: "version must be a string",
                });
            }
            updateData.appVersion = version;
        }

        if (notificationEnabled) {
            if (typeof notificationEnabled !== "boolean") {
                return res.status(400).json({
                    success: false,
                    message: "notificationEnabled must be boolean",
                });
            }
            updateData.notificationEnabled = notificationEnabled;
        }

        // 3️⃣ If nothing to update
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                message: "no fields to update",
            });
        }

        // 4️⃣ Update passenger
        const updatedPassenger = await PassengerModel.findOneAndUpdate(
            { phone },
            updateData,
            {
                new: true,
                runValidators: true,
            }
        );

        // 5️⃣ Handle not found
        if (!updatedPassenger) {
            return res.status(404).json({
                success: false,
                message: "passenger not found",
            });
        }

        // 6️⃣ Success response
        return res.status(200).json({
            success: true,
            message: "passenger updated successfully",
            data: {
                passengerId: updatedPassenger._id,
                appVersion: updatedPassenger.appVersion,
                notificationEnabled: updatedPassenger.notificationEnabled,
            },
        });
    } catch (error) {
        console.error("updatePassenger error:", error);

        return res.status(500).json({
            success: false,
            message: "internal server error",
        });
    }
};