const logger = require('../utils/logger');

/**
 * Global Fastify error handler
 */
const errorHandler = (error, request, reply) => {
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    url: request.url,
    method: request.method,
  });

  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? 'Internal Server Error' : error.message;

  reply.status(statusCode).send({
    success: false,
    error: message,
    statusCode,
  });
};

module.exports = { errorHandler };
