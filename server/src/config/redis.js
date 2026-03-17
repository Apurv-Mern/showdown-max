const Redis = require('ioredis');
const { env } = require('./env');
const logger = require('../utils/logger');

let redis = null;
let redisReady = false;

/**
 * @returns {Redis | null} Redis client instance, or null if unavailable
 */
const getRedisClient = () => {
  if (!redis) {
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 3) {
          logger.warn('Redis max retries reached, giving up');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
    });

    redis.on('ready', () => {
      redisReady = true;
      logger.info('Redis ready');
    });

    redis.on('error', (err) => {
      redisReady = false;
      logger.error('Redis connection error', { error: err.message });
    });

    redis.on('close', () => {
      redisReady = false;
    });

    redis.connect().catch((err) => {
      logger.warn('Redis initial connection failed, running without Redis', { error: err.message });
    });
  }

  return redis;
};

/**
 * @returns {boolean} Whether Redis is connected and ready
 */
const isRedisReady = () => redisReady;

module.exports = { getRedisClient, isRedisReady };
