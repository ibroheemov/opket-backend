import { IRideOption } from "../models/Ride";

export type DriverStatus = "offline" | "available" | "on_trip";

export type UploadStatus = "NOT_PROVIDED" | "PENDING_UPLOAD" | "UPLOADED" | "UPLOAD_FAILED";

export interface UploadMeta {
    url?: string;
    publicId?: string;
    status: UploadStatus;
}

export interface Driver {
    id: string;
    firstname: string;
    lastname: string;
    fullname: string;
    phone: string;
    password: string;
    vehicle: string;
    car_model: string;
    car_number: string;
    car_color: string;
    region_code: string;
    balance: number;
    commission_rate?: number;
    blocked: boolean;
    driver_license?: UploadMeta;
    enabled_options?: string[];
    created_at?: string;
}

export interface DriverRequestBody {
    firstname: string;
    lastname: string;
    phone: string;
    password: string;
    car_model: string;
    car_number: string;
    car_color: string;
    region_code: string;
    driver_license: Express.Multer.File;
}

export interface DriverLoginRequestBody {
    phone: string;
    password: string;
    verified: boolean;
}

export interface CompleteGhostRideRequestBody {
    fare: string;
    distance: number;
    pauseSeconds: boolean;
    commission: number;
    driverId?: String;
    options: IRideOption[];
}

// SOCKET TYPES
export interface DriverSocketSetStatusBody {
    status: string;
}

export interface DriverSocketLocationBody {
    latitude: number;
    longitude: number;
    bearing: number;
    geoType: string;
}

export interface DriverSocketLocationToPassengerBody {
    latitude: number;
    longitude: number;
    heading: number;
    phone: number;
}

// REDIS TYPES
export interface UpdateLocationBody {
    driverId: string;
    latitude: number;
    longitude: number;
    bearing: number;
    geoType: string;
}