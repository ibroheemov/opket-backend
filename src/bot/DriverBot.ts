import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import { setupAuthHandlers } from "./handlers/authHandler";
import { setupMenuHandlers } from "./handlers/menuHandler";
import { setupRideHandlers } from "./handlers/rideHandler";
import { setupLocationHandler } from "./handlers/locationHandler";

declare module "node-telegram-bot-api" {
    interface Location {
        live_period?: number;
    }
}

dotenv.config();

export const driverBot = new TelegramBot(process.env.DRIVER_BOT_TOKEN!, { polling: true });
const BACKEND_URL = process.env.BACKEND_URL!;

// register handlers
setupAuthHandlers(driverBot, BACKEND_URL);
setupMenuHandlers(driverBot, BACKEND_URL);
setupRideHandlers(driverBot, BACKEND_URL);
setupLocationHandler(driverBot, BACKEND_URL);

console.log("🚖 PayTube Driver Bot is running...");
