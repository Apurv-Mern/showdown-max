const Redis = require('ioredis');
const { env } = require('./env');
const logger = require('../utils/logger');

let redis = null;
let redisReady = false;
let lastRedisMode = 'memory';
let redisFailureLogged = false;
let redisRecoveryLogged = false;

const getSafeRedisTarget = () => {
  try {
    const parsed = new URL(env.REDIS_URL);
    return `${parsed.hostname}:${parsed.port || '6379'}`;
  } catch {
    return 'unavailable';
  }
};

const markRedisMode = (mode, extra = {}) => {
  if (lastRedisMode === mode) return;
  lastRedisMode = mode;
  if (mode === 'redis') {
    redisRecoveryLogged = true;
    redisFailureLogged = false;
    logger.info('Redis mode switched to redis', { target: getSafeRedisTarget(), ...extra });
  } else {
    redisFailureLogged = true;
    redisRecoveryLogged = false;
    logger.warn('Redis mode switched to memory fallback', { target: getSafeRedisTarget(), ...extra });
  }
};

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
      markRedisMode('redis');
      logger.info('Redis connected and ready');
    });

    redis.on('error', (err) => {
      if (redisReady) {
        logger.error('Redis connection lost', { error: err.message });
      }
      redisReady = false;
      if (!redisFailureLogged) {
        markRedisMode('memory', { error: err.message });
      }
    });

    redis.on('close', () => {
      redisReady = false;
      if (!redisFailureLogged) {
        markRedisMode('memory', { reason: 'connection_closed' });
      }
    });

    redis.connect().then(() => {
      markRedisMode('redis');
      logger.info('Redis connection established');
    }).catch((err) => {
      markRedisMode('memory', { error: err.message });
      logger.warn('Redis not available, using in-memory fallback', { error: err.message });
    });
  }

  return redis;
};

/**
 * @returns {boolean} Whether Redis is connected and ready
 */
const isRedisReady = () => redisReady;

const getRedisMode = () => (redisReady ? 'redis' : 'memory');

const pingRedis = async () => {
  if (!redis) {
    getRedisClient();
  }

  if (!redis || !redisReady) {
    return { ok: false, message: 'Redis unavailable', mode: getRedisMode(), target: getSafeRedisTarget() };
  }

  try {
    const response = await redis.ping();
    return {
      ok: response === 'PONG',
      message: response,
      mode: getRedisMode(),
      target: getSafeRedisTarget(),
    };
  } catch (error) {
    return {
      ok: false,
      message: error.message,
      mode: getRedisMode(),
      target: getSafeRedisTarget(),
    };
  }
};

module.exports = {
  getRedisClient,
  isRedisReady,
  getRedisMode,
  getSafeRedisTarget,
  pingRedis,
};
