import { log } from "console";
import { DriverModel } from "../models/DriverModel";
import { PassengerModel } from "../models/PassengerModel";
import { RideModel } from "../models/Ride";
import { driverStore } from "../store/driverStore";
import { driverStoreRedis } from "../store/driverStoreRedis";
import { passengerStore } from "../store/passengerStore";
import { driverSockets, socketIo, userSockets } from "./socket.maps";

const driver_missable_events = ["ride_cancelled", "luggage_confirmed", "luggage_declined", "ride_change_declined", "ride_change_confirmed"];
const passenger_missable_events = [
    "ride_started",
    "ride_accepted",
    "balance_deduction_request",
    "balance_top_up",
    "add_luggage",
    "ride_no_drivers",
    "driver_arrived",
    "ride_cancelled_by_driver",
];

export const updateRideStatus = async (rideId: string, status: string) => {
    if (rideId == '') return null;

    const ride = await RideModel.findById(rideId);
    if (!ride) return null;

    ride.status = status;
    if (status === "started") {
        ride.lastLocation = ride.pickup;
    }
    await ride.save();
    return ride;
};

export const emitToUser = async (id: number | undefined, event: string, data: any) => {
    if (!id) return;
    const isOnline = passengerStore.isOnline(id);

    console.log(event, isOnline);

    // If passenger is not in store (offline / not connected) and event is missable
    if (!isOnline && passenger_missable_events.includes(event)) {
        passengerStore.pushPendingEvent(id, event, data);
    }

    const socketId = userSockets.get(Number(id));
    console.log(id, event, socketId);

    if (socketId) {
        socketIo.to(socketId).emit(event, data);
        return true;
    }
    return false;
};

export const emitToDriver = async (driverId: string, event: string, data: any) => {
    // const driver = await driverStoreRedis.get(driverId);

    // console.log(`SOCKET STATUS: ${driver?.socketStatus} \nIS EVENT INCLUDED${driver_missable_events.includes(event)} (${event})`);

    // if (driver?.socketStatus == "disconnected" && driver_missable_events.includes(event)) {
    //     await DriverModel.findByIdAndUpdate(
    //         driverId,
    //         {
    //             $push: {
    //                 events: {
    //                     event: event,
    //                     data: data
    //                 }
    //             }
    //         },
    //         { new: true }
    //     );
    // }

    const socketId = driverSockets.get(driverId);

    if (socketId) {
        socketIo.to(socketId).emit(event, data);
        return true;
    }
    return false;
};
