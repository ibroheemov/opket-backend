// redisClient.ts
import { createClient } from 'redis';

const redis = createClient({
    username: 'default',
    password: process.env.REDIS_PASSWORD,
    socket: {
        host: process.env.REDIS_ENDPOINT,
        port: 16049
    }
});


redis.on('error', (err) => console.error('Redis Client Error', err));

async function connectRedis() {
    await redis.connect();
    console.log('Connected to Redis');
}

export { redis, connectRedis };
