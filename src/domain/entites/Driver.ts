import { Location } from "../valueObjects/Location";
export type DriverStatus = "available" | "assigned" | "on_trip";

export class Driver {
    constructor(
        public id: string,
        public name: string,
        public phone: string,
        public vehicle: string,
        public status: "offline" | "available" | "on_trip",
        public location: { lat: number; lon: number },
        public otp?: string,
        public otpExpiresAt?: Date,
        public chatId?: number,
    ) { }
}
