export const rideKeys = {
    ride: (rideId: string) => `ride:${rideId}`,
    cancel: (rideId: string) => `ride_cancel:${rideId}`,
    accept: (rideId: string) => `ride_accept:${rideId}`,
    lock: (rideId: string) => `ride_search_lock:${rideId}`,
    offeredSet: (rideId: string) => `ride_offered:${rideId}`,
    reservation: (rideId: string, driverId: string) =>
        `ride_reservation:${rideId}:${driverId}`,
    driverOffer: (driverId: string) => `driver_offer:${driverId}`,
    driver: (driverId: string) => `driver:${driverId}`,
};
