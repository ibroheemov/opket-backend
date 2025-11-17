import TelegramBot from "node-telegram-bot-api";
import { config } from "./config/env";
import { handleStart } from "./handlers/startHandler";
import { handleLocation } from "./handlers/clientLocationHandler";
import { setupUserCallbackHandlers } from "./handlers/userCalbackHandlers";

export const userBot = new TelegramBot(config.token, { polling: true });

// Command handlers
userBot.onText(/\/start/, handleStart);

// Location handler
userBot.on("location", handleLocation);

setupUserCallbackHandlers(userBot);

console.log("🚀 User bot is running...");
