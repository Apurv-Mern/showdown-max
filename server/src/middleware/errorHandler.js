const logger = require('../utils/logger');

/**
 * Global Fastify error handler — maps common error types to proper HTTP status codes.
 * @param {Error} error
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 */
const errorHandler = (error, request, reply) => {
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Internal Server Error';

  if (error.validation) {
    statusCode = 400;
    message = error.message;
  }

  if (error.code === 'FST_ERR_NOT_FOUND' || error.message?.includes('not found')) {
    statusCode = 404;
  }

  if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
    statusCode = 400;
    message = error.errors?.map((e) => e.message).join(', ') || 'Validation error';
  }

  if (error.name === 'SequelizeForeignKeyConstraintError') {
    statusCode = 400;
    message = 'Referenced resource does not exist';
  }

  if (statusCode >= 500) {
    logger.error('Unhandled server error', {
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
    });
    message = 'Internal Server Error';
  } else {
    logger.warn('Request error', {
      statusCode,
      error: message,
      url: request.url,
      method: request.method,
    });
  }

  reply.status(statusCode).send({
    success: false,
    error: message,
    statusCode,
  });
};

module.exports = { errorHandler };
