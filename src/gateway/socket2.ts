import { Server } from "socket.io";
import http from "http";
import { authenticateSocket } from "./socket.auth";
import { registerDriverHandlers } from "./driver.socket";
import { registerUserHandlers } from "./user.socket";
import { setSocketServer } from "./socket.maps";

export let socketIo: Server;

export const initSocketServer = (server: http.Server) => {
    socketIo = new Server(server, { cors: { origin: "*" } });
    setSocketServer(socketIo);

    socketIo.on("connection", (socket) => {
        const auth = authenticateSocket(socket);
        if (!auth) {
            console.warn("❌ Unauthorized connection, disconnecting");
            socket.disconnect(true);
            return;
        }

        if (auth.driverId) registerDriverHandlers(socket, auth.driverId);
        else if (auth.userChatId) registerUserHandlers(socket, auth.userChatId);
    });

    console.log("✅ WebSocket gateway initialized");
    return socketIo;
};
