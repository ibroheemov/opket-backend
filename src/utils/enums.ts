export enum RidePhase {
    PENDING = "pending",
    ACCEPTED = "accepted",
    CANCELLED = "cancelled",
}

export enum DriverSocketEvents {
    SET_STATUS = "driver:set_status",
    LOCATION = "driver:location",
    LOCATION_TO_PASSENGER = "driver:location:passenger",
}

export enum DriverRedisKeys {
    DRIVER = "driver:",
    ONLINE_DRIVERS = "drivers:online",
    AVAILABLE_DRIVERS = "drivers:available",
    ACTIVE_OFFERS = "offers:active",
}