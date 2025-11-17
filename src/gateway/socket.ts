import admin from 'firebase-admin';
import { RideOfferPaylod } from "../services/ride.service";

export interface SocketAuthPayload {
    id: string;
    phone?: string;
}

// export let socketIo: Server;
export const driverSockets = new Map<string, string>(); // driverId -> socketId
export const userSockets = new Map<number, string>(); // userChatId -> socketId

// notify a user (by Telegram chat id)
export const notifyUser = (userChatId: number, event: string, payload: any) => {
    console.log();
    userSockets.forEach((val, key) => {
        console.log(val, key);
    })
    const socketId = userSockets.get(Number(userChatId));
    if (!socketId) {
        console.log(`⚠️ User chat ${userChatId} not connected — can't send ${event}`);
        return false;
    }
    // socketIo.to(socketId).emit(event, payload);
    return true;
};
