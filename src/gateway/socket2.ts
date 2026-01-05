import { Server } from "socket.io";
import http from "http";
import { authenticateSocket } from "./socket.auth";
import { registerDriverHandlers } from "./driver.socket";
import { registerUserHandlers } from "./user.socket";
import { setSocketServer } from "./socket.maps";
import { driverStore } from "../store/driverStore";
import { registerPassengerHandlersMobile } from "./passenger.socket";
import { registerDriverBGHandler } from "./driver.socket.bg";

export let socketIo: Server;

export const initSocketServer = (server: http.Server) => {
    // Initialize Socket.IO with path /socket.io
    socketIo = new Server(server, {
        cors: { origin: "*" },
        path: "/socket.io",
    });

    // Save reference globally
    setSocketServer(socketIo);

    socketIo.on("connection", (socket) => {
        const auth = authenticateSocket(socket);
        if (!auth) {
            console.warn("❌ Unauthorized connection, disconnecting");
            socket.disconnect(true);
            return;
        }

        if (auth.driverId && auth.fcmToken && auth.location) {
            registerDriverHandlers({
                socket,
                driverId: auth.driverId,
                fcmToken: auth.fcmToken,
                location: auth.location
            });
        } else if (auth.driverId && auth.isBackground) {
            registerDriverBGHandler({
                socket,
                driverId: auth.driverId,
            });
        }
        else if (auth.userChatId) {
            registerUserHandlers(socket, auth.userChatId);
        } else if (auth.phone) {
            registerPassengerHandlersMobile({ socket, phone: auth.phone });
            // socket.emit('ride_accepted', { test: true });
        }
    });
    return socketIo;
};
