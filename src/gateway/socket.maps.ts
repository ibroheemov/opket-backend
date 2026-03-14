import { Server } from "socket.io";

export const restaurantSockets = new Map<string, string>(); // driverId -> socketId
export const driverSockets = new Map<string, string>(); // driverId -> socketId
export const userSockets = new Map<number, string>();   // userChatId -> socketId

export let socketIo: Server;

export const setSocketServer = (io: Server) => {
    socketIo = io;
};
