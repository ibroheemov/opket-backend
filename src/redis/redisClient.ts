// redisClient.ts
import { createClient } from 'redis';
import { config } from '../bot/config/env';
import { driverSessionStore } from '../store/driver.session.store';
import { driverLocationStore } from '../store/driver.location.store';

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
    if (key.startsWith("driver:")) {
        const driverId = key.split(":")[1];

        await driverLocationStore.removeDriver(driverId);
        await driverSessionStore.setOffline(driverId);
    }
});
redis.on('error', (err) => console.error('Redis Client Error', err));
redisSub.on('error', (err) => console.error('Redis Sub Error', err));



async function connectRedis() {
    await Promise.all([
        redis.connect(),
        redisSub.connect(),
    ]);
    console.log('Connected to Redis (cmd + sub)');
}

export { redis, redisSub, connectRedis };
