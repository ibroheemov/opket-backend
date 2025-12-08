// db.ts
import mongoose from "mongoose";
import { config } from "../bot/config/env";

export async function connectDB() {
    try {
        await mongoose.connect(config.MONGO_URI, {
            dbName: "paytube", // name of your database
        });
        console.log("✅ ✅ MongoDB connected");
    } catch (err) {
        console.error("❌ MongoDB connection error:", err);
        process.exit(1);
    }
}
