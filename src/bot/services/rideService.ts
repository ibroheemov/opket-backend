import axios from "axios";
import { config } from "../config/env";

export interface RequestRideResponse {
    ride_id: string;
    message?: string;
    drivers: number;
}

export async function requestRide(chatId: number, location: { lat: number; lon: number }, phone?: number, isPremium?: boolean) {
    const res = await axios.post<RequestRideResponse>(`${config.backendUrl}/user/request-ride`, {
        chatId,
        phone,
        location,
        type: "bot",
        rideType: isPremium ? "premium" : "standard",
        options: isPremium ? ["premium"] : []
    });

    // console.log(res.data);

    return res.data;
}
