import { Server } from "socket.io";
import http from "http";
import { authenticateSocket, SocketClient } from "./socket.auth";
import { registerDriverHandlers } from "./driver.socket";
import { registerUserHandlers } from "./user.socket";
import { setSocketServer } from "./socket.maps";
import { driverStore } from "../store/driverStore";
import { registerPassengerHandlersMobile } from "./passenger.socket";
import { registerDriverBGHandler } from "./driver.socket.bg";
import { registerRestaurantHandlers } from "./restaurant.socket";
import { registerRestaurantBGHandler } from "./restaurant.socket.bg";
import { Socket } from "socket.io";

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
        const client = authenticateSocket(socket);

        if (!client) {
            socket.disconnect(true);
            return;
        }

        switch (client.type) {
            case "driver":
                registerDriverHandlers({ socket, driverId: client.id });
                break;
            case "restaurant":
                registerRestaurantHandlers({ socket, restaurantId: client.id });
                break;
            case "passenger":
                registerPassengerHandlersMobile({ socket, id: client.id });
                break;
        }
    });
    return socketIo;
};
