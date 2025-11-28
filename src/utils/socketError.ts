import { Socket } from "socket.io";

export const handleSocketError = (socket: Socket, message: string, error: Error | null = null) => {
    if (error) console.error(message, error);
    else console.warn(message);
    socket.emit("error", { message });
};
