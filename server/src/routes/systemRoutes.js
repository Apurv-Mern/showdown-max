const { success } = require('../utils/responseWrapper');
const { sequelize } = require('../models');
const {
  pingRedis,
  isRedisReady,
  getRedisMode,
  getSafeRedisTarget,
} = require('../config/redis');
const redisStore = require('../services/redisSessionStore');
const logger = require('../utils/logger');

const systemRoutes = async (fastify) => {
  fastify.get('/health', async (request) => {
    let db = { ok: false, message: 'Unknown' };
    try {
      await sequelize.authenticate();
      db = { ok: true, message: 'Connected' };
    } catch (error) {
      db = { ok: false, message: error.message };
    }

    const redisPing = await pingRedis();
    const cacheSummary = await redisStore.getCacheSummary();

    return success({
      status: db.ok ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      pid: process.pid,
      env: process.env.NODE_ENV,
      requestId: request.correlationId || request.id,
      database: db,
      redis: {
        ok: redisPing.ok,
        ready: isRedisReady(),
        mode: getRedisMode(),
        target: getSafeRedisTarget(),
        ping: redisPing.message,
      },
      cache: cacheSummary,
    }, 'System health');
  });

  fastify.get('/cache', async (request) => {
    const pin = request.query?.pin ? String(request.query.pin).trim() : '';
    const cache = pin
      ? await redisStore.inspectSessionCache(pin)
      : await redisStore.inspectCache();

    logger.info('Cache inspected', {
      requestId: request.id,
      correlationId: request.correlationId || request.id,
      actorRole: request.user?.role,
      actorEmail: request.user?.email,
      pin: pin || undefined,
      mode: cache.mode,
      keyCount: cache.keys.length,
    });

    return success(cache, pin ? `Cache inspection for PIN ${pin}` : 'Global cache inspection');
  });

  fastify.delete('/cache', async (request) => {
    const pin = request.query?.pin ? String(request.query.pin).trim() : '';
    const result = pin
      ? await redisStore.cleanupSession(pin).then(() => ({
          mode: getRedisMode(),
          scope: 'pin',
          pin,
        }))
      : await redisStore.clearAllGameCaches();

    logger.warn('Cache cleared', {
      requestId: request.id,
      correlationId: request.correlationId || request.id,
      actorRole: request.user?.role,
      actorEmail: request.user?.email,
      pin: pin || undefined,
      ...result,
    });

    return success(result, pin ? `Cache cleared for PIN ${pin}` : 'All app cache cleared');
  });
};

module.exports = systemRoutes;
