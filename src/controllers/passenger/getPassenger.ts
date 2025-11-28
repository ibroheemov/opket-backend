import { AuthRequest } from "../../middlewares/auth";
import { Response } from "express";
import { PassengerModel } from "../../models/PassengerModel";

export const getPassenger = async (req: AuthRequest, res: Response) => {

    const id = req.params.id;
    if (!id) return res.sendStatus(400);

    const passenger = await PassengerModel.findOne({ chatId: id }).lean();

    if (!passenger) {
        return res.status(404).json({ message: "Passenger not found" });
    }

    res.json(passenger);
};