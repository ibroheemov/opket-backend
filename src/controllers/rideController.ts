// import { Response } from "express";
// import { RideModel } from "../models/Ride";
// import { AuthRequest } from "../middlewares/auth";
// import { calculateFare } from "../utils/fareCalculator";
// import { DriverModel } from "../models/Drivermodel";

// export const markArrived = async (req: AuthRequest, res: Response) => {
//     const { rideId } = req.body;
//     const ride = await RideModel.findOne({ id: rideId });
//     if (!ride) return res.status(404).json({ error: "Ride not found" });

//     ride.status = "arrived";
//     await ride.save();

//     return res.json({ success: true, message: "Driver arrived" });
// };

// export const startRide = async (req: AuthRequest, res: Response) => {
//     const { rideId } = req.body;
//     const ride = await RideModel.findOne({ id: rideId });
//     if (!ride) return res.status(404).json({ error: "Ride not found" });

//     ride.status = "started";
//     ride.startedAt = new Date();
//     await ride.save();

//     return res.json({ success: true, message: "Trip started" });
// };

// export const endRide = async (req: AuthRequest, res: Response) => {
//     const { rideId } = req.body;
//     const ride = await RideModel.findOne({ id: rideId });
//     if (!ride) return res.status(404).json({ error: "Ride not found" });

//     ride.status = "completed";
//     ride.endedAt = new Date();
//     ride.distanceKm = Math.random() * 10 + 1; // mock distance
//     ride.fare = calculateFare(ride.distanceKm);
//     await ride.save();

//     await DriverModel.findOneAndUpdate({ id: ride.driverId }, { currentRideId: null });

//     return res.json({
//         success: true,
//         message: "Trip ended",
//         fare: ride.fare,
//         distanceKm: ride.distanceKm,
//     });
// };
