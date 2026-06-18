const { success } = require('../utils/responseWrapper');
const { buildHealthSnapshot } = require('../utils/healthSnapshot');
const redisStore = require('../services/redisSessionStore');
const { getRedisMode } = require('../config/redis');
const logger = require('../utils/logger');

const systemRoutes = async (fastify) => {
  fastify.get('/health', async (request) => {
    const snapshot = await buildHealthSnapshot(request);
    return success(snapshot, 'System health');
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
