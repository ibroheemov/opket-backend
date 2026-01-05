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
import { handleRidePayChange } from "./handlers/ridePayChange";
import { config } from "../config/env";
import { userBot } from "../PassengerBot";
import { handleRideClosed } from "./handlers/rideClosed";

export function initUserSocket(chatId: any, phone: number): Socket {
    console.log("chatId", chatId);

    const backendUrl = config.backendUrl.replace("/api", "");

    const socket = io(backendUrl, {
        path: "/socket.io",
        transports: ["websocket"],
        auth: { userChatId: phone || "unknown" },
    });


    // Register event handlers
    socket.on("ride_assigned", (data: RideAssignedPayload) => {
        handleRideAssigned(userBot, chatId, data)
    }
    );

    socket.on("ride_no_drivers", () => {
        handleRideNoDrivers(userBot, chatId)
    }
    );

    socket.on("driver_location_update", (data: DriverLocationUpdatePayload) => {
        handleDriverLocationUpdate(userBot, chatId, data)
    }
    );

    socket.on("ride_status_update", (data: RideStatusPayload) => {
        handleRideStatusUpdate(userBot, chatId, data)
    }
    );

    socket.on("add_luggage", () => {
        handleAddLuggage(userBot, chatId)
    }
    );

    socket.on("ride_started", (data: RideStartedPayload) => {
        handleRideStarted(chatId, data)
    });

    socket.on("ride_progress", (data: RideProgressPayload) => {
        handleRideProgress(userBot, chatId, data)
    }
    );

    socket.on("pay_change", async (data: RidePayChangePayload) => {
        handleRidePayChange(userBot, chatId, data)
    });

    socket.on("ride_closed", async () => {
        handleRideClosed(userBot, chatId)
    });

    socket.on("ride_completed", (data: RideCompletedPayload) => {
        handleRideCompleted(userBot, chatId, data)
    });

    socket.on("connect", () => console.log("🟢 #1[PASSENGER] connected"));
    socket.on("connect_error", (err) =>
        console.error("🟢❌ PASSENGER Connection error:", err.message)
    );
    socket.on("disconnect", () => console.log("🟢🔴 PASSENGER disconnected"));

    return socket;
}
