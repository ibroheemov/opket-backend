import TelegramBot, { Message } from "node-telegram-bot-api";
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
import { handleMessage } from "./handlers/handleMessage";

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

    bot.on("message", handleMessage);

    userBot.on("contact", async (msg) => {
        const chatId = msg.chat.id;
        const session = getSession(chatId);
        const phone = msg?.contact?.phone_number;

        session.phone = phone;
        queueMessageForDeletion(chatId, msg.message_id);
        const sent = await userBot.sendMessage(chatId, "✅ Raqam qabul qilindi!");
        deleteMessageSafely(chatId, msg.message_id);
        if (session.currentMsgId) deleteMessageSafely(chatId, session.currentMsgId);
        queueMessageForDeletion(chatId, sent.message_id);
        const ride = await RideModel.findByIdAndUpdate(session.rideId, { userPhoneNumber: phone });

        if (ride && ride.driverId) {
            socketIo.emit("user_contact", { phone });
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
    });
} else {
    // Production: webhook is set in server.ts
    attachHandlers(userBot);
}