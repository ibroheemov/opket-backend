import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import { setupAuthHandlers } from "./handlers/authHandler";
import { setupMenuHandlers } from "./handlers/menuHandler";
import { setupRideHandlers } from "./handlers/rideHandler";
import { setupLocationHandler } from "./handlers/locationHandler";
import { config } from "./config/env";

declare module "node-telegram-bot-api" {
    interface Location {
        live_period?: number;
    }
}


export const driverBot = new TelegramBot(config.driverBotToken, { polling: true });
const BACKEND_URL = config.backendUrl;

// register handlers
setupAuthHandlers(driverBot, BACKEND_URL);
setupMenuHandlers(driverBot, BACKEND_URL);
setupRideHandlers(driverBot, BACKEND_URL);
setupLocationHandler(driverBot, BACKEND_URL);

