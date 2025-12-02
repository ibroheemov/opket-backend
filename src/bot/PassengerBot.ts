import TelegramBot from "node-telegram-bot-api";
import { config } from "./config/env";
import { handleStart } from "./handlers/startHandler";
import { handleLocation } from "./handlers/clientLocationHandler";
import { setupUserCallbackHandlers } from "./handlers/userCalbackHandlers";
import { deleteMessageSafely, flushDeletionQueue, queueMessageForDeletion } from "./utils/message_cleanup_manager";
import { getSession } from "./services/sessionManager";
import { RideModel } from "../models/Ride";
import { emit } from "process";
import { socketIo } from "../gateway/socket2";
import { driverStore } from "../store/driverStore";

export const userBot = new TelegramBot(
    config.token, {
    polling: false,
}
);

function attachHandlers(bot: TelegramBot) {
    // Command handlers
    userBot.onText(/\/start/, handleStart);

    // Location handler
    userBot.on("location", handleLocation);

    userBot.on("contact", async (msg) => {
        console.log("CONTAATC");

        const chatId = msg.chat.id;

        const session = getSession(chatId);

        const phone = msg?.contact?.phone_number;
        console.log(phone);

        session.phone = phone;
        queueMessageForDeletion(chatId, msg.message_id);
        const sent = await userBot.sendMessage(chatId, "✅ Raqam qabul qilindi!");
        deleteMessageSafely(chatId, msg.message_id);
        if (session.currentMsgId) deleteMessageSafely(chatId, session.currentMsgId);
        queueMessageForDeletion(chatId, sent.message_id);
        const ride = await RideModel.findByIdAndUpdate(session.rideId, { userPhoneNumber: phone });
        console.log(ride?.driverId);

        if (ride && ride.driverId) {
            const driverSession = driverStore.get(ride.driverId);
            console.log("DRIVER SESSION");
            console.log(driverSession);
            driverStore.upsert(ride.driverId, { currentRideId: null });
            socketIo.to(driverSession?.socketId!).emit("user_contact", { phone });
        }
    });

    setupUserCallbackHandlers(userBot);
}


// ----------------- Environment-based initialization -----------------

if (config.env === "development") {
    // Clear old updates to avoid phantom triggers
    userBot.getUpdates({ offset: -1 }).then(() => {
        attachHandlers(userBot);
        userBot.startPolling(); // Only in dev
        console.log("🚀 User bot running in development mode with polling...");
    });
} else {
    // Production: webhook is set in server.ts
    attachHandlers(userBot);
    console.log("🚀 User bot running in production mode with webhook...");
}