import { AuthRequest } from "../../middlewares/auth";
import { Response } from "express";
import { PassengerModel } from "../../models/PassengerModel";
import { generateAccessToken, generateRefreshToken } from "../../utils/jwt";

export const verifyPassenger = async (req: AuthRequest, res: Response) => {

    try {
        const phone = req.params.phone;
        if (!phone) return res.sendStatus(400);

        const passenger = await PassengerModel.findOneAndUpdate({ phone }, { verified: true });

        if (!passenger) {
            return res.status(401).json({ message: "Passenger not found" });
        }

        const accessToken = generateAccessToken({ id: passenger._id, role: "CONSUMER" });
        const refreshToken = generateRefreshToken({ id: passenger._id, role: "CONSUMER" });

        console.log(accessToken);
        console.log(refreshToken);


        res.status(200).json({
            accessToken,
            refreshToken,
        });
    } catch (error) {
        console.error("login error:", error);
        return res.status(500).json({ message: "Login failed" });
    }
};