import TelegramBot from "node-telegram-bot-api";
import { config } from "./config/env";
import { handleStart } from "./handlers/startHandler";
import { handleLocation } from "./handlers/clientLocationHandler";
import { setupUserCallbackHandlers } from "./handlers/userCalbackHandlers";

export const userBot = new TelegramBot(config.token, {
    polling: config.env === "development"
});

(async () => {
    if (config.env === "production") {
        await userBot.setWebHook(`${config.webhookDomain}/bot${config.token}`);
        console.log("Webhook set for production");
    }
})();

// Command handlers
userBot.onText(/\/start/, handleStart);

// Location handler
userBot.on("location", handleLocation);

setupUserCallbackHandlers(userBot);

console.log("🚀 User bot is running...");
