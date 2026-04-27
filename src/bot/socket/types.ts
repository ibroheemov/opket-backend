import { Socket } from "socket.io";
import { IDriverDocument } from "../../models/DriverModel";
import { DriverLocation } from "../../types/location";


export interface RestaurantSocketConnectionPayload {
    socket: Socket;
    restaurantId: string;
}

export interface DriverSocketConnectionPayload {
    socket: Socket;
    driverId: string;

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
    userPhoneNumber: number;
    distance: string;
    fare: string;
}

export interface RideCompletedPayload {
    driverId: string;
    rideId: string;
    distance: string;
    fare: string;
    pauseSeconds?: number;
}


export interface RidePayChangePayload {
    amount: number;
    passengerBalance: number;
    driverId: string;
}
