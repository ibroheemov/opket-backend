// redisClient.ts
import { createClient } from 'redis';
import { config } from '../bot/config/env';

const redis = createClient({
    username: 'default',
    password: config.REDIS_PASSWORD,
    socket: {
        host: config.REDIS_ENDPOINT,
        port: Number(config.REDIS_PORT),
    },
});

const redisSub = createClient({
    username: 'default',
    password: config.REDIS_PASSWORD,
    socket: {
        host: config.REDIS_ENDPOINT,
        port: Number(config.REDIS_PORT),
    },
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
