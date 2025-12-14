import { RideModel } from "../models/Ride";
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

export const emitToUser = (chatId: number, event: string, data: any) => {
    const socketId = userSockets.get(chatId);
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
