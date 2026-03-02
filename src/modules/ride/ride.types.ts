export enum RideSearchMode {
    SEQUENTIAL = "sequential",
    PARALLEL = "parallel",
}

export type DriverCandidate = {
    driverId: string;
    distKm: number;
};

export interface RideRequestInput {
    phone: number;
    rideType: string;
    location: { lat: number; lon: number };
    options: string[];
    chatId?: number;
    dropoff?: { lat: number; lon: number; address?: string };
    address?: string;
    type?: string;
}

export interface GhostRideInput {
    driverId: string;
    fare: number;
    distanceTraveled: number,
    pauseSeconds?: number,
}

export type RideSearchStopReason = "accepted" | "cancelled" | "expired";

export type RideDriverOfferPayload = {
    type: "ride_request";
    ride_id: string;
    phone: string;
    chatId: string;
    pickup: string; // JSON string
    travelDistance: string;
    travelTime: string;
    rideType: string;
};

export type NotifyOfferedDriversParams = {
    rideId: string;
    reason: RideSearchStopReason;
    winnerDriverId?: string;
    cleanupKeys?: boolean;
    deleteOfferedSet?: boolean;
};

export type AcceptRideResult =
    | { success: true; rideId: string; driverId: string }
    | { success: false; reason: string };

export type RideCompletedPayload = {
    rideId: string;
    distance: number;
    fare: number;
};

export type RideState = Record<string, string>;
