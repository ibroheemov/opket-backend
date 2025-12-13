import { driverSockets, socketIo } from "../gateway/socket.maps";
import { DriverModel } from "../models/DriverModel";
import { RideModel } from "../models/Ride";
import { driverStore } from "../store/driverStore";

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

    // Determine if driver should still receive offers
    const canReceiveOffers = driver.balance > 0;

    // If DB field exists, update it as well
    if (driver.canReceiveOffers !== canReceiveOffers) {
        await DriverModel.findByIdAndUpdate(driverId, {
            canReceiveOffers,
        });
    }

    // 🔄 Update driverStore if driver is online
    const session = driverStore.get(driverId);
    if (session) {
        driverStore.upsert(driverId, { canReceiveOffers });

        // Notify driver if they lost access
        if (!canReceiveOffers) {
            const socketId = driverSockets.get(driverId);
            if (socketId) {
                socketIo.to(socketId).emit("no_balance", {
                    balance: driver.balance,
                });
            }
        }
    }


    return { commission, balance: driver.balance };
};
