import { Socket } from "socket.io";
import { DriverModel } from "../models/DriverModel";
import { driverSockets } from "./socket.maps";
import { RideService } from "../services/ride.service";
import { handleSocketError } from "../utils/socketError";

export const registerDriverBGHandler = async ({ socket, driverId }: {
    socket: Socket;
    driverId: string;
}) => {
    const driver = await DriverModel.findById(driverId);

    if (!driver) {
        console.error("🟡❌ DRIVER => SOCKET BG CONNECTION - Driver not found in DB:", driverId);
        socket.emit("error", { message: "Driver not found" });
        return; // stop socket setup
    }

    console.log("🟡♻️ DRIVER BG connected");

    driverSockets.set(`${driverId}-bg`, socket.id);

    socket.on("accept_ride", async ({ rideId }: { rideId: string }) => {
        console.log("ACCEPTED RIDE", rideId);
        try {
            await RideService.acceptRide(rideId, driverId);
        } catch (err) {
            handleSocketError(socket, (err as Error).message, err as Error);
        }
    });
}