import axios from "axios";
import { config } from "../config/env";

export interface RequestRideResponse {
    rideId: string;
    message?: string;
    drivers: number;
}

export async function requestRide(chatId: number, location: { lat: number; lon: number }) {
    const res = await axios.post<RequestRideResponse>(`${config.backendUrl}/user/request-ride`, {
        chatId,
        location,
    });
    return res.data;
}
