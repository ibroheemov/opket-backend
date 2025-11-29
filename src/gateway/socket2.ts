import { Server } from "socket.io";
import http from "http";
import { authenticateSocket } from "./socket.auth";
import { registerDriverHandlers } from "./driver.socket";
import { registerUserHandlers } from "./user.socket";
import { setSocketServer } from "./socket.maps";

export let socketIo: Server;

export const initSocketServer = (server: http.Server) => {
    // Initialize Socket.IO with path /socket.io
    const socketIo = new Server(server, {
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

        if (auth.driverId && auth.fcmToken) {
            registerDriverHandlers({ socket, driverId: auth.driverId, fcmToken: auth.fcmToken });
        } else if (auth.userChatId) {
            registerUserHandlers(socket, auth.userChatId);
        }
    });

    console.log("✅ WebSocket gateway initialized on path /socket.io");
    return socketIo;
};
