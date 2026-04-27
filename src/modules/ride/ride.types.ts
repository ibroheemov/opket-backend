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
    fcmToken?: string;
    pickup: { latitude: number; longitude: number };
    options: string[];
    dropoff?: { latitude: number; longitude: number; address?: string };
    address?: string;
    delivery?: DeliveryData;
    isDelivery: boolean;
}

export interface DeliveryData {
    orderId: string;
    orderNumber: number;
    pickup: Location;
    dropOff: Location;
    pricing: DeliveryPricing;
    items: DeliveryItems[];
    consumerPhone: number;
    restaurantPhone: number;
    restaurantName: string;
    restaurantId: string;
}

export interface DeliveryPricing {
    itemsSubtotal: number;
    deliveryFee: number;
    tax: number;
    discount: number;
    total: number;
}


export interface DeliveryItems {
    menuItemId: string;
    name: string;
    quantity: number;
    subtotal: number;
    price: number;
}

export interface Location {
    lat: number;
    lon: number;
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
