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
    "driver_location_update",
    "driver_arrived"
];

export const updateRideStatus = async (rideId: string, status: string) => {
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
    const passenger = passengerStore.get(id);
    if (!passenger && passenger_missable_events.includes(event)) {
        await PassengerModel.findOneAndUpdate(
            { phone: id },
            {
                $push: {
                    events: {
                        event: event,
                        data: data
                    }
                }
            },
            { new: true }
        );
    }

    const socketId = userSockets.get(id);
    if (socketId) {
        socketIo.to(socketId).emit(event, data);
        return true;
    }
    return false;
};

export const emitToDriver = async (driverId: string, event: string, data: any) => {
    const driver = await driverStoreRedis.get(driverId);

    console.log(`SOCKET STATUS: ${driver?.socketStatus} \nIS EVENT INCLUDED${driver_missable_events.includes(event)} (${event})`);

    if (driver?.socketStatus == "disconnected" && driver_missable_events.includes(event)) {
        await DriverModel.findByIdAndUpdate(
            driverId,
            {
                $push: {
                    events: {
                        event: event,
                        data: data
                    }
                }
            },
            { new: true }
        );
    }

    const socketId = driverSockets.get(driverId);

    if (socketId) {
        socketIo.to(socketId).emit(event, data);
        return true;
    }
    return false;
};
