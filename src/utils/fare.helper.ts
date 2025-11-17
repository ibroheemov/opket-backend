import { driverSockets, socketIo } from "../gateway/socket.maps";
import { DriverModel } from "../models/DriverModel";
import { RideModel } from "../models/Ride";

/**
 * Deducts commission from driver’s balance when a ride completes.
 * @param driverId - The driver's MongoDB ID
 * @param rideId - The completed ride's ID
 * @param commissionRate - Commission rate (default 12%)
 */
export const handleRideCommission = async (
    driverId: string,
    rideId: string,
    commissionRate = 0.12
) => {
    const ride = await RideModel.findById(rideId);
    if (!ride) throw new Error("Ride not found");

    const fare = ride.fare || 0;
    const commission = fare * commissionRate;

    // Deduct commission from driver balance
    const driver = await DriverModel.findByIdAndUpdate(
        driverId,
        { $inc: { balance: -commission } }, // <-- subtract commission
        { new: true }
    );

    if (!driver) throw new Error("Driver not found");

    console.log(
        `💸 Driver ${driverId} charged ${commission.toFixed(
            0
        )} UZS commission (balance now ${driver.balance})} UZS)`
    );

    // Optional: notify driver via socket
    // const socketId = driverSockets.get(driverId);
    // if (socketId) {
    //     socketIo.to(socketId).emit("balance_update", {
    //         balance: driver.balance,
    //         commission,
    //     });
    // }

    return { commission, fare, balance: driver.balance };
};
