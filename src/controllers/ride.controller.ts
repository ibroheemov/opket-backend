import { Request, Response } from "express";
// import { RideService } from "../services/ride.service";
import { RideService } from "../services/ride.new.service";
import { logger } from "../utils/logger";
import { IRide, RideModel } from "../models/Ride";
import { DriverModel, IDriverDocument } from "../models/DriverModel";
import { TransactionModel } from "../models/TransactionModel";
import { AuthRequest } from "../middlewares/auth";
import { socketIo } from "../gateway/socket.maps";
import { RideRepository } from "../repositories/ride.repository";
import { sendOfferToDrivers } from "../utils/sendOfferToNextDriver";
import { services } from "../data/fare.database";
import { DriverLocation } from "../types/location";
import { driverStoreRedis } from "../store/driverStoreRedis";
import { CompleteGhostRideRequestBody } from "../types/driver.types";
import { GhostRideModel } from "../models/GhostRide";
import { RideRequestInput } from "../modules/ride/ride.types";
import { emitToUser } from "../gateway/ride.socket";

export const requestRide = async (req: AuthRequest, res: Response) => {
    try {
        const data: RideRequestInput = req.body;
        const passengerId = req.id;

        if (!passengerId) {
            return res.status(400).json({ message: "passengerId is required" });
        }

        const result = await RideService.requestRide({ ...data, passengerId });
        return res.status(200).json(result);
    } catch (err) {
        // logger.error("requestRide error:", err);
        return res.status(500).json({ error: `Internal server error: ${err}` });
    }
};



export const acceptRide = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const driverId = req.driverId;

        if (!driverId) {
            return res.status(401).json({ success: false, message: "Avtorizatsiyadan o'ting" });
        }

        const acceptResult: { success: boolean } = await RideService.acceptRide(id, driverId);
        const ride = await RideModel.findById(id).lean();

        if (!ride) {
            return res.status(404).json({ success: false, message: "Buyurtma topilmadi" });
        }

        if (!acceptResult.success) {
            return res.status(409).json({
                success: false,
                message: "Buyurtma boshqa haydovchi tomonidan qabul qilingan",
            });
        }

        return res.status(200).json({ success: true, message: "Buyurtma qabul qilindi" });
    } catch (err) {
        console.error('Error accepting ride:', err);
        return res.status(500).json({ success: false, message: "Server xatosi. Iltimos qayta urinib ko'ring" });
    }
};

export const skipRide = async (req: AuthRequest, res: Response) => {
    try {

    } catch (err) {
        console.error('Error fetching current ride:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const toggleRideOption = async (req: AuthRequest, res: Response) => {
    try {
        const { id, add, rideId } = req.body as { id: string; add: boolean; rideId: string };

        if (!rideId) return res.json({ ok: true });
        if (!id) return res.status(400).json({ error: "service id is required" });
        if (typeof add !== "boolean") return res.status(400).json({ error: "add must be boolean" });

        const service = services.find((s) => s.id === id);
        if (!service) return res.status(400).json({ error: `Unknown service id: ${id}` });

        let ride;

        if (add) {
            // add only if not exists
            ride = await RideModel.findOneAndUpdate(
                { _id: rideId, "options.id": { $ne: id } },
                { $push: { options: { id, charge: service.charge } } },
                { new: true }
            );
            // if it already existed, just return current ride
            if (!ride) ride = await RideModel.findById(rideId);
        } else {
            // remove if exists
            ride = await RideModel.findOneAndUpdate(
                { _id: rideId },
                { $pull: { options: { id } } },
                { new: true }
            );
        }

        if (ride?.userPhoneNumber) {
            const userPhone = Number(ride?.userPhoneNumber);
            const title = `${service.description}, ${service.charge} UZS qo'shildi`;
            const body = `Haydovchi yo'l haqqiga qo'shimcha summa kiritdi: ${service.description}, ${service.charge}`;

            RideService.sendPassengerMessage({ userPhone, title, body });
        }

        if (!ride && add) {
            // add only if not exists
            ride = await GhostRideModel.findOneAndUpdate(
                { _id: rideId, "options.id": { $ne: id } },
                { $push: { options: { id, charge: service.charge } } },
                { new: true }
            );
            // if it already existed, just return current ride
            if (!ride) ride = await RideModel.findById(rideId);
        } else if (!ride && !add) {
            ride = await GhostRideModel.findOneAndUpdate(
                { _id: rideId },
                { $pull: { options: { id } } },
                { new: true }
            );
        }

        if (!ride) return res.status(404).json({ error: "Ride not found" });

        return res.json({ ok: true, ride });
    } catch (err) {
        console.error("Error toggling ride option:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export const completeRide = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.driverId;
        const { rideId, distance, fare, userPhoneNumber } = req.body;

        if (!driverId) {
            return res.status(400).json({ message: "driverId is required" });
        }

        if (!rideId || !distance || !fare) {
            return res.status(400).json({ message: "These are required [rideId, distance, fare]" });
        }

        await RideService.completeRide({ driverId, rideId, distance, fare });

        const emitted = emitToUser(userPhoneNumber, "ride_completed", {});


        return res.status(200).json({ message: "Ride completed successfully" });
    } catch (err) {
        console.error('Error completing current ride:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const completeGhostRide = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.driverId;
        const data: CompleteGhostRideRequestBody = req.body;

        if (!driverId) {
            return res.status(400).json({ message: "driverId is required" });
        }

        await RideService.completeRideGhostRide({ driverId, data });

        return res.status(200).json({ message: "Ride completed successfully" });
    } catch (err) {
        console.error('Error completing current ride:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};


export const declineRide = async (req: AuthRequest, res: Response) => {
    try {
        const { rideId } = req.body;
        // Remove this driver from the candidate list
        const driverId = req.driverId; // depends on your auth logic

        if (!driverId) {
            return res.status(400).json({ message: "driverId is required" });
        }

        await RideRepository.pullDriverCandidate(rideId, driverId);

        // Clear if this driver is currently offeredTo
        await RideModel.findOneAndUpdate(
            { _id: rideId, offeredTo: driverId },
            { $unset: { offeredTo: "" }, $set: { offerExpiresAt: null } }
        );

        // Now schedule next driver immediately
        sendOfferToDrivers(rideId);

        return res.send({ success: true });
    } catch (err) {
        console.error('Error fetching current ride:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};


export const currentRide = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // Find the ride and populate the driver with selected fields
        const ride = await RideModel.findById(id)
            .populate({
                path: "driverId",
                select: "_id name phone carModel carColor carNumber regionCode",
            })
            .lean();


        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }
        var driver_location: DriverLocation | null;


        if (ride.driverId) {
            const driverId = ride.driverId._id.toString();

            driver_location = await driverStoreRedis.getDriverLocation(driverId);

        } else {
            return res.status(404).json({ error: 'Driver not attached' });
        }

        if (!driver_location) {
            return res.status(404).json({ error: 'No Driver location found' });
        }

        return res.status(200).json({ ...ride, driver_location });
    } catch (err) {
        console.error('Error fetching current ride:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};