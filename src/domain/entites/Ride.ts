import { Location } from "../valueObjects/Location";

export type RideStatus = "requested" | "confirmed" | "driver_arrived" | "in_progress" | "completed" | "cancelled";

export class Ride {
    constructor(
        public id: string,
        public userId: string,
        public pickup: Location,
        public dropoff?: Location,
        public driverId?: string,
        public status: RideStatus = "requested",
        public startedAt?: number,
        public endedAt?: number,
        public distanceKm: number = 0,
        public fare: number = 0
    ) { }
}
