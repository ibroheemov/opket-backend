import { PassengerModel } from "../models/PassengerModel";
import { RideModel } from "../models/Ride";
import { passengerStore } from "../store/passengerStore";
import { driverSockets, socketIo, userSockets } from "./socket.maps";

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
    if (!passenger) {
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

export const emitToDriver = (driverId: string, event: string, data: any) => {
    const socketId = driverSockets.get(driverId);

    if (socketId) {
        socketIo.to(socketId).emit(event, data);
        return true;
    }
    return false;
};
