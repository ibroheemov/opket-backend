import { Socket } from "socket.io";
import { IDriverDocument } from "../../models/DriverModel";
import { DriverLocation } from "../../types/location";

export interface DriverSocketConnectionPayload {
    socket: Socket;
    driverId: string;
    fcmToken: string;
    location: DriverLocation;
}

export interface SocketAuthPayload {
    socket: Socket;
    driverId: string;
    fcmToken: string;
}

export interface RideAssignedPayload {
    chatId: number;
    driver: IDriverDocument & { location: { lat: number; lon: number } };
    location: DriverLocation;
}

export interface DriverLocationUpdatePayload {
    chatId: number;
    driver: IDriverDocument;
    location: { lat: number; lon: number };
}

export interface RideStartedPayload {
    rideId: string;
    fare: string;
}

export interface RideStatusPayload {
    status: string;
    message: string;
}

export interface RideProgressPayload {
    distance: string;
    fare: string;
}

export interface RideCompletedPayload {
    rideId: string;
    distance: string;
    fare: string;
}


export interface RidePayChangePayload {
    amount: number;
    passengerBalance: number;
    driverId: string;
}
