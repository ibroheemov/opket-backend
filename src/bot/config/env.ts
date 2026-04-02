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
    mapBoxToken: process.env.MAPBOX_ACCESS_TOKEN!,
    backendUrl: process.env.BACKEND_URL!,
    jwtSecret: process.env.JWT_SECRET!,
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    FIREBASE_ADMIN_SA: process.env.FIREBASE_ADMIN_SA!,
    MONGO_URI: process.env.MONGO_URI_OPKET!,
    PORT: Number(process.env.PORT || 3000),
    REDIS_ENDPOINT: process.env.REDIS_ENDPOINT!,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD!,
    REDIS_PORT: process.env.REDIS_PORT!,
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_KEY: process.env.SUPABASE_KEY!,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY!,
};



