// redisClient.ts
import { createClient } from 'redis';
import { config } from '../bot/config/env';

const redis = createClient({
    username: 'default',
    password: config.REDIS_PASSWORD,
    socket: {
        host: config.REDIS_ENDPOINT,
        port: Number(config.REDIS_PORT)
    }
});


redis.on('error', (err) => console.error('Redis Client Error', err));

async function connectRedis() {
    await redis.connect();
    console.log('Connected to Redis');
}

export { redis, connectRedis };
