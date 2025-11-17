import { IDriverDocument } from "../../models/DriverModel";
import { DriverLocation } from "../../types/location";

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

export interface RideStatusPayload {
    status: string;
    message: string;
}

export interface RideProgressPayload {
    distance: string;
    fare: string;
}
