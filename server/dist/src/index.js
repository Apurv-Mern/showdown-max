const Fastify = require('fastify');
const crypto = require('crypto');
const cors = require('@fastify/cors');
const { env } = require('./config/env');
const { getCorsOptions } = require('./config/cors');
const { getSSLConfig } = require('./config/ssl');
const logger = require('./utils/logger');
const { errorHandler } = require('./middleware/errorHandler');
const { initializeSocket } = require('./socket');
const { success } = require('./utils/responseWrapper');
const { buildHealthSnapshot } = require('./utils/healthSnapshot');
const { testConnection, syncDatabase } = require('./models');
const {
  getRedisClient,
  isRedisReady,
  getRedisMode,
  getSafeRedisTarget,
} = require('./config/redis');

const authRoutes = require('./routes/authRoutes');
const quizRoutes = require('./routes/quizRoutes');
const questionRoutes = require('./routes/questionRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const teamRoutes = require('./routes/teamRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const publicMediaRoutes = require('./routes/publicMediaRoutes');
const roundRoutes = require('./routes/roundRoutes');
const hostRoutes = require('./routes/hostRoutes');
const publicSessionRoutes = require('./routes/publicSessionRoutes');
const systemRoutes = require('./routes/systemRoutes');
const { requireAdmin, requireAdminOrHost } = require('./middleware/authMiddleware');

const start = async () => {
  const sslConfig = getSSLConfig();
  const fastifyOptions = {
    logger: false,
  };

  logger.boundary('SERVER RESTARTED', {
    timestamp: new Date().toISOString(),
    pid: process.pid,
    env: env.NODE_ENV,
    port: env.PORT,
    storageBackend: env.STORAGE_BACKEND,
    s3Bucket: env.S3_BUCKET || null,
  });

  if (sslConfig) {
    fastifyOptions.https = sslConfig;
  }

  const fastify = Fastify(fastifyOptions);

  await fastify.register(cors, getCorsOptions());

  fastify.addHook('onRequest', async (request, reply) => {
    const requestId = request.headers['x-request-id'] || request.id || crypto.randomUUID();
    request.correlationId = requestId;
    request.startTime = Date.now();
    reply.header('x-request-id', requestId);

    logger.info('HTTP request started', {
      requestId,
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const durationMs = Date.now() - (request.startTime || Date.now());
    logger.info('HTTP request completed', {
      requestId: request.correlationId || request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      durationMs,
      actorRole: request.user?.role,
      actorEmail: request.user?.email,
    });
  });

  fastify.setErrorHandler(errorHandler);

  fastify.get('/health', async (request) => {
    const snapshot = await buildHealthSnapshot(request);
    return success(snapshot, 'Server health');
  });

  fastify.register(authRoutes, { prefix: '/api/auth' });
  fastify.register(publicSessionRoutes, { prefix: '/api/public/sessions' });
  fastify.register(publicMediaRoutes, { prefix: '/api/public/media' });

  fastify.register(async (scope) => {
    scope.addHook('onRequest', requireAdmin);
    scope.register(quizRoutes, { prefix: '/api/quizzes' });
    scope.register(questionRoutes, { prefix: '/api/questions' });
    scope.register(mediaRoutes, { prefix: '/api/media' });
    scope.register(roundRoutes, { prefix: '/api/rounds' });
    scope.register(hostRoutes, { prefix: '/api/hosts' });
    scope.register(systemRoutes, { prefix: '/api/system' });
  });

  fastify.register(async (scope) => {
    scope.addHook('onRequest', requireAdminOrHost);
    scope.register(sessionRoutes, { prefix: '/api/sessions' });
    scope.register(teamRoutes, { prefix: '/api/teams' });
  });

  await testConnection();
  logger.info('Database target', {
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
  });
  getRedisClient();

  setTimeout(() => {
    if (!isRedisReady()) {
      logger.warn(
        'Redis unavailable — live session data is stored in Node.js heap. Start Redis on the server to avoid memory growth and restarts.',
        { mode: getRedisMode(), target: getSafeRedisTarget() },
      );
    }
  }, 3000).unref();

  if (env.NODE_ENV === 'development' && env.DB_SYNC_ALTER) {
    await syncDatabase({ alter: true });
  } else if (env.NODE_ENV === 'development') {
    logger.info('Skipping sequelize sync alter in development (set DB_SYNC_ALTER=true to enable)');
  }

  await fastify.listen({ port: env.PORT, host: '0.0.0.0' });

  const httpServer = fastify.server;
  initializeSocket(httpServer);

  const protocol = sslConfig ? 'https' : 'http';
  logger.info(`Server running on port ${env.PORT}`);
  logger.info(`Environment: ${env.NODE_ENV}`);
  logger.info(`Protocol: ${protocol.toUpperCase()}`);
  logger.info(`Health check: ${protocol}://localhost:${env.PORT}/health`);
};

start().catch((err) => {
  logger.boundary(
    'SERVER STARTUP FAILED',
    {
      timestamp: new Date().toISOString(),
      pid: process.pid,
      env: env.NODE_ENV,
      port: env.PORT,
      error: err.message,
    },
    'error',
  );
  logger.error('Failed to start server', { error: err.message, stack: err.stack });
  process.exit(1);
});
