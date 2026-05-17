// redisClient.ts
import { createClient } from 'redis';
import { config } from '../bot/config/env';
import { driverSessionStore } from '../store/driver.session.store';
import { driverLocationStore } from '../store/driver.location.store';
import { emitToDriver } from '../gateway/ride.socket';
import { NotificationService } from '../fcm/notification.service';

const reconnectStrategy = (retries: number) => Math.min(retries * 200, 5000);

const redis = createClient({
    username: 'default',
    password: config.REDIS_PASSWORD,
    socket: {
        host: config.REDIS_ENDPOINT,
        port: Number(config.REDIS_PORT),
        reconnectStrategy,
    },
});

const redisSub = createClient({
    username: 'default',
    password: config.REDIS_PASSWORD,
    socket: {
        host: config.REDIS_ENDPOINT,
        port: Number(config.REDIS_PORT),
        reconnectStrategy,
    },
});

const subscriber = redis.duplicate();

subscriber.connect();

subscriber.on('error', (err) => console.error('Redis Subscriber Error', err));

subscriber.subscribe("__keyevent@0__:expired", async (key: string) => {
    // Only match session keys: "driver:{id}" — not cache keys like "driver:fcm:{id}"
    const parts = key.split(":");
    if (parts.length === 2 && parts[0] === "driver") {
        const driverId = parts[1];

        await driverLocationStore.removeDriver(driverId);
        await driverSessionStore.setOffline(driverId);
        emitToDriver(driverId, "forced_offline", { reason: "session_expired" });
        NotificationService.driver.forcedOffline(driverId).catch((err) =>
            console.error("[FCM] forced_offline send failed:", err)
        );
    }
});
redis.on('error', (err) => console.error('Redis Client Error', err));
redisSub.on('error', (err) => console.error('Redis Sub Error', err));



async function connectRedis() {
    await Promise.all([
        redis.connect(),
        redisSub.connect(),
    ]);
    // Required for __keyevent@0__:expired subscription to fire
    await redis.configSet('notify-keyspace-events', 'KEx');
    console.log('Connected to Redis (cmd + sub)');
}

export { redis, redisSub, connectRedis };
