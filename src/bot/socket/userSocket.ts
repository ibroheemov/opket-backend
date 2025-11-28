import { io, Socket } from "socket.io-client";
import TelegramBot from "node-telegram-bot-api";
import {
    handleRideAssigned,
    handleDriverLocationUpdate,
    handleRideStatusUpdate,
    handleRideStarted,
    handleRideProgress,
    handleRideCompleted,
} from "./handlers";
import {
    RideAssignedPayload,
    DriverLocationUpdatePayload,
    RideStatusPayload,
    RideProgressPayload,
    RideCompletedPayload,
    RidePayChangePayload,
    RideStartedPayload,
} from "./types";
import { handleRideNoDrivers } from "./handlers/rideNoDrivers";
import { handleAddLuggage } from "./handlers/rideAddLuggage";
import { PassengerModel } from "../../models/PassengerModel";
import { handleRidePayChange } from "./handlers/ridePayChange";

export function initUserSocket(bot: TelegramBot, chatId: number): Socket {
    const socket = io(process.env.BACKEND_URL!, {
        transports: ["websocket"],
        auth: { userChatId: chatId || "unknown" },
    });

    console.log("🔌 Initializing user socket...");

    // Register event handlers
    socket.on("ride_assigned", (data: RideAssignedPayload) =>
        handleRideAssigned(bot, chatId, data)
    );

    socket.on("ride_no_drivers", () =>
        handleRideNoDrivers(bot, chatId)
    );

    socket.on("driver_location_update", (data: DriverLocationUpdatePayload) =>
        handleDriverLocationUpdate(bot, chatId, data)
    );

    socket.on("ride_status_update", (data: RideStatusPayload) =>
        handleRideStatusUpdate(bot, chatId, data)
    );

    socket.on("add_luggage", () =>
        handleAddLuggage(bot, chatId)
    );

    socket.on("ride_started", (data: RideStartedPayload) => handleRideStarted(chatId, data));

    socket.on("ride_progress", (data: RideProgressPayload) =>
        handleRideProgress(bot, chatId, data)
    );

    socket.on("pay_change", async (data: RidePayChangePayload) => {
        handleRidePayChange(bot, chatId, data)
    }
    );

    socket.on("ride_completed", (data: RideCompletedPayload) => handleRideCompleted(bot, chatId, data));

    socket.on("connect", () => console.log("✅ User socket connected"));
    socket.on("connect_error", (err) =>
        console.error("🚨 Connection error:", err.message)
    );
    socket.on("disconnect", () => console.log("❌ User socket disconnected"));

    return socket;
}
