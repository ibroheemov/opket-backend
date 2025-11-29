import dotenv from "dotenv";
const env = process.env.NODE_ENV || "development";

// Load the correct .env file
dotenv.config({
    path: env === "production" ? ".env.production" : ".env.development"
});

export const config = {
    env,
    token: process.env.BOT_TOKEN!,
    driverBotToken: '',
    webhookDomain: process.env.WEBHOOK_DOMAIN!,
    backendUrl: process.env.BACKEND_URL!,
    port: Number(process.env.PORT || 3000),
};

