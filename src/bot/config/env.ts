import dotenv from "dotenv";
dotenv.config();

export const config = {
    token: process.env.USER_BOT_TOKEN!,
    driverBotToken: process.env.DRIVER_BOT_TOKEN!,
    backendUrl: process.env.BACKEND_URL!,
};

