import { Socket } from "socket.io";
import { DriverModel } from "../models/DriverModel";
import { driverSockets } from "./socket.maps";
import { RideService } from "../services/ride.service";
import { handleSocketError } from "../utils/socketError";

export const registerRestaurantBGHandler = async ({ socket, restaurantId }: {
    socket: Socket;
    restaurantId: string;
}) => {
    driverSockets.set(`${restaurantId}-bg`, socket.id);
    console.log("Restaurant connected BG", restaurantId);
}