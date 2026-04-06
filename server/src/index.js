const Fastify = require('fastify');
const cors = require('@fastify/cors');
const { env } = require('./config/env');
const { getSSLConfig } = require('./config/ssl');
const logger = require('./utils/logger');
const { errorHandler } = require('./middleware/errorHandler');
const { initializeSocket } = require('./socket');
const { success } = require('./utils/responseWrapper');
const { testConnection, syncDatabase } = require('./models');
const { getRedisClient } = require('./config/redis');

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
const { requireAdmin, requireAdminOrHost } = require('./middleware/authMiddleware');

const start = async () => {
  const sslConfig = getSSLConfig();
  const fastifyOptions = {
    logger: false,
  };

  if (sslConfig) {
    fastifyOptions.https = sslConfig;
  }

  const fastify = Fastify(fastifyOptions);

  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  fastify.setErrorHandler(errorHandler);

  fastify.get('/health', async () => {
    return success({ status: 'ok', timestamp: new Date().toISOString() }, 'Server is running');
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
  logger.error('Failed to start server', { error: err.message, stack: err.stack });
  process.exit(1);
});
