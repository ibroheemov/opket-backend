import { driverSockets, socketIo } from "../gateway/socket.maps";
import { DriverModel } from "../models/DriverModel";
import { RideModel } from "../models/Ride";
import { driverStore } from "../store/driverStore";
import { driverStoreRedis } from "../store/driverStoreRedis";
import { getDefaultCommission } from "./getCommission";
import { sendFcm } from "./sendFcm";

/**
 * Deducts commission from driver’s balance when a ride completes.
 * @param driverId - The driver's MongoDB ID
 * @param rideId - The completed ride's ID
 * @param commissionRate - Commission rate (default 12%)
 */
export const handleRideCommission = async (
    driverId: string,
    fare: number,
) => {
    const driver = await DriverModel.findById(driverId);
    if (!driver) throw new Error("Driver not found");

    const commissionRate =
        driver?.commissionRate
            ? driver.commissionRate / 100
            : await getDefaultCommission();

    const commission = fare * commissionRate;

    // Deduct commission from driver balance
    await DriverModel.findByIdAndUpdate(
        driverId,
        { $inc: { balance: -commission } }, // <-- subtract commission
        { new: true }
    );


    // Determine if driver should still receive offers
    const canReceiveOffers = driver.balance > 0;

    // If DB field exists, update it as well
    if (driver.canReceiveOffers !== canReceiveOffers) {
        await DriverModel.findByIdAndUpdate(driverId, {
            canReceiveOffers,
        });
    }

    // 🔄 Update driverStore if driver is online
    const session = await driverStoreRedis.get(driverId);
    if (session) {
        // driverStoreRedis.upsert(driverId, { canReceiveOffers });

        // // Notify driver if they lost access
        // if (!canReceiveOffers) {
        //     const socketId = driverSockets.get(driverId);
        //     if (socketId) {
        //         socketIo.to(socketId).emit("no_balance", {
        //             balance: driver.balance,
        //         });
        //     }
        // }
    }

    if (driver?.fcmToken) {
        sendFcm(driver.fcmToken, commission);
    }

    return commission;
};
