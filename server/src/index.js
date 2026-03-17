const Fastify = require('fastify');
const cors = require('@fastify/cors');
const { env } = require('./config/env');
const logger = require('./utils/logger');
const { errorHandler } = require('./middleware/errorHandler');
const { initializeSocket } = require('./socket');
const { success } = require('./utils/responseWrapper');
const { testConnection, syncDatabase } = require('./models');

const quizRoutes = require('./routes/quizRoutes');
const questionRoutes = require('./routes/questionRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const teamRoutes = require('./routes/teamRoutes');
const mediaRoutes = require('./routes/mediaRoutes');

const start = async () => {
  const fastify = Fastify({
    logger: false,
  });

  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  fastify.setErrorHandler(errorHandler);

  fastify.get('/health', async () => {
    return success({ status: 'ok', timestamp: new Date().toISOString() }, 'Server is running');
  });

  fastify.register(quizRoutes, { prefix: '/api/quizzes' });
  fastify.register(questionRoutes, { prefix: '/api/questions' });
  fastify.register(sessionRoutes, { prefix: '/api/sessions' });
  fastify.register(teamRoutes, { prefix: '/api/teams' });
  fastify.register(mediaRoutes, { prefix: '/api/media' });

  await testConnection();

  if (env.NODE_ENV === 'development') {
    await syncDatabase({ alter: true });
  }

  await fastify.listen({ port: env.PORT, host: '0.0.0.0' });

  const httpServer = fastify.server;
  initializeSocket(httpServer);

  logger.info(`Server running on port ${env.PORT}`);
  logger.info(`Health check: http://localhost:${env.PORT}/health`);
};

start().catch((err) => {
  logger.error('Failed to start server', { error: err.message, stack: err.stack });
  process.exit(1);
});
