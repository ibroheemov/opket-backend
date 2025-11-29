import TelegramBot from "node-telegram-bot-api";
import { config } from "./config/env";
import { handleStart } from "./handlers/startHandler";
import { handleLocation } from "./handlers/clientLocationHandler";
import { setupUserCallbackHandlers } from "./handlers/userCalbackHandlers";

export const userBot = new TelegramBot(config.token, {
    polling: config.env === "development"
});
console.log(config.env);

(async () => {
    if (config.env === "production") {
        await userBot.setWebHook(`${config.webhookDomain}/bot${config.token}`);

        // try {
        //     const webhookInfo = await userBot.getWebHookInfo();
        //     if (!webhookInfo.url || webhookInfo.url === "") {
        //         await userBot.setWebHook(`${config.webhookDomain}/bot${config.token}`);
        //         console.log("Webhook set for production");
        //     } else {
        //         console.log("Webhook already set, skipping setWebHook");
        //     }
        // } catch (err) {
        //     console.error("Error checking/setting webhook:", err);
        // }
    }
})();

// Command handlers
userBot.onText(/\/start/, handleStart);

// Location handler
userBot.on("location", handleLocation);

setupUserCallbackHandlers(userBot);

console.log("🚀 User bot is running...");
