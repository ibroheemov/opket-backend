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
    jwtSecret: process.env.JWT_SECRET!,
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    FIREBASE_ADMIN_SA: process.env.FIREBASE_ADMIN_SA!,
    MONGO_URI: process.env.MONGO_URI!,
    PORT: Number(process.env.PORT || 3000),
};

