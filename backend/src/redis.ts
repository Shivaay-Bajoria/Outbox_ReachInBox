import { Redis } from 'ioredis';
import { config } from './config.js';

/** BullMQ requires maxRetriesPerRequest=null for blocking worker connections. */
export const createRedis = () => new Redis(config.redisUrl, { maxRetriesPerRequest: null });

/** Shared connection for counters, locks and the Lua rate limiter. */
export const redis = createRedis();
