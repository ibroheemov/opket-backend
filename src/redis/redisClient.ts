import { createClient } from "redis";

export const redisClient = createClient({
    url: "redis://localhost:6379", // docker service name
});

redisClient.on("error", (err) => {
    console.error("❌ Redis Client Error", err);
});

export async function connectRedis() {
    if (!redisClient.isOpen) {
        await redisClient.connect();
        console.log("✅ Connected to Redis");
    }
}
