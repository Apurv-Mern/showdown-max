const os = require('os');
const { env } = require('../config/env');
const { sequelize } = require('../models');
const {
  pingRedis,
  isRedisReady,
  getRedisMode,
  getSafeRedisTarget,
} = require('../config/redis');
const redisStore = require('../services/redisSessionStore');
const timerManager = require('../services/game-engine/timerManager');

const bytesToMiB = (bytes) => Math.round((bytes / (1024 * 1024)) * 100) / 100;

const getRuntimeMemorySnapshot = () => {
  const mem = process.memoryUsage();
  const heapUsagePercent =
    mem.heapTotal > 0 ? Math.round((mem.heapUsed / mem.heapTotal) * 10000) / 100 : 0;

  let inMemoryGame = null;
  try {
    const gameController = require('../services/game-engine/gameController');
    if (typeof gameController.getInMemoryDiagnostics === 'function') {
      inMemoryGame = gameController.getInMemoryDiagnostics();
    }
  } catch {
    inMemoryGame = null;
  }

  return {
    rssMiB: bytesToMiB(mem.rss),
    heapTotalMiB: bytesToMiB(mem.heapTotal),
    heapUsedMiB: bytesToMiB(mem.heapUsed),
    externalMiB: bytesToMiB(mem.external),
    arrayBuffersMiB: bytesToMiB(mem.arrayBuffers ?? 0),
    heapUsagePercent,
    memoryPressure: heapUsagePercent >= 85,
    activeTimers: timerManager.getActiveTimerCount(),
    inMemoryGame,
    systemFreeMemMiB: bytesToMiB(os.freemem()),
    systemTotalMemMiB: bytesToMiB(os.totalmem()),
  };
};

/**
 * Build the standard health payload used by `/health` and `/api/system/health`.
 * @param {import('fastify').FastifyRequest} [request]
 */
const buildHealthSnapshot = async (request) => {
  let db = { ok: false, message: 'Unknown' };
  try {
    await sequelize.authenticate();
    db = { ok: true, message: 'Connected' };
  } catch (error) {
    db = { ok: false, message: error.message };
  }

  const redisPing = await pingRedis();
  const cacheSummary = await redisStore.getCacheSummary();
  const memory = getRuntimeMemorySnapshot();

  let status = db.ok ? 'ok' : 'degraded';
  if (!redisPing.ok || getRedisMode() === 'memory') {
    status = 'degraded';
  }
  if (memory.memoryPressure && status === 'ok') {
    status = 'degraded';
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    pid: process.pid,
    env: env.NODE_ENV,
    nodeVersion: process.version,
    requestId: request?.correlationId || request?.id,
    database: db,
    redis: {
      ok: redisPing.ok,
      ready: isRedisReady(),
      mode: getRedisMode(),
      target: getSafeRedisTarget(),
      ping: redisPing.message,
    },
    cache: cacheSummary,
    memory,
  };
};

module.exports = { buildHealthSnapshot, getRuntimeMemorySnapshot };
