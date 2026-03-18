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
        if (times > 5) {
          logger.warn('Redis max retries reached, falling back to in-memory');
          return null;
        }
        return Math.min(times * 500, 3000);
      },
    });

    redis.on('ready', () => {
      redisReady = true;
      logger.info('Redis connected and ready');
    });

    redis.on('error', (err) => {
      if (redisReady) {
        logger.error('Redis connection lost', { error: err.message });
      }
      redisReady = false;
    });

    redis.on('close', () => {
      redisReady = false;
    });

    redis.connect().then(() => {
      logger.info('Redis connection established');
    }).catch((err) => {
      logger.warn('Redis not available, using in-memory fallback', { error: err.message });
    });
  }

  return redis;
};

/**
 * @returns {boolean} Whether Redis is connected and ready
 */
const isRedisReady = () => redisReady;

module.exports = { getRedisClient, isRedisReady };
