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
import { handleContact } from "./handlers/handleContact";

export const userBot = new TelegramBot(
    config.token, {
    polling: false,
}
);

export function attachHandlers(bot: TelegramBot) {
    // Command handlers
    userBot.onText(/\/start/, handleStart);

    // Location handler
    userBot.on("location", handleLocation);

    bot.on("message", handleMessage);

    userBot.on("contact", handleContact);

    setupUserCallbackHandlers(userBot);
}

