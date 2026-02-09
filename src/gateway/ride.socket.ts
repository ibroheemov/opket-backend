import { log } from "console";
import { DriverModel } from "../models/DriverModel";
import { PassengerModel } from "../models/PassengerModel";
import { RideModel } from "../models/Ride";
import { driverStore } from "../store/driverStore";
import { driverStoreRedis } from "../store/driverStoreRedis";
import { passengerStore } from "../store/passengerStore";
import { driverSockets, socketIo, userSockets } from "./socket.maps";

const driver_missable_events = ["luggage_confirmed", "luggage_declined", "ride_change_declined", "ride_change_confirmed"];
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

    // If passenger is not in store (offline / not connected) and event is missable
    if (!isOnline && passenger_missable_events.includes(event)) {
        passengerStore.pushPendingEvent(id, event, data);
    }

    const socketId = userSockets.get(Number(id));

    if (socketId) {
        socketIo.to(socketId).emit(event, data);
        return true;
    }
    return false;
};

export const emitToDriver = async (driverId: string, event: string, data: any) => {

    const socketId = driverSockets.get(driverId);
    const isOnline = await driverStoreRedis.isSocketConnected(driverId);

    if (!isOnline && driver_missable_events.includes(event)) {
        driverStoreRedis.pushPendingEvent(driverId, event, data);
    }

    console.log("isOnline:", isOnline, event);


    if (socketId) {
        socketIo.to(socketId).emit(event, data);
        return true;
    }
    return false;
};
