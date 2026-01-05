import { Socket } from "socket.io";
import { DriverModel } from "../models/DriverModel";
import { driverSockets } from "./socket.maps";

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
}