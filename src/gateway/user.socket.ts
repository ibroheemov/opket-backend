import { Socket } from "socket.io";
import { userSockets } from "./socket.maps";

export const registerUserHandlers = (socket: Socket, userChatId: number) => {
    userSockets.set(userChatId, socket.id);
    socket.on("disconnect", () => {
        userSockets.delete(userChatId);
        console.log(`❌ User disconnected: chatId=${userChatId}`);
    });
};
