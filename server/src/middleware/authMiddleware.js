const { Session } = require('../models');
const logger = require('../utils/logger');

/**
 * Validates host token against the session's stored hostToken.
 * Expects x-host-token header and sessionId in params or body.
 */
const hostAuth = async (request, reply) => {
  const token = request.headers['x-host-token'];

  if (!token) {
    reply.status(401).send({
      success: false,
      error: 'Missing host token',
      statusCode: 401,
    });
    return;
  }

  const sessionId = request.params?.sessionId || request.body?.sessionId;

  if (!sessionId) {
    reply.status(400).send({
      success: false,
      error: 'Missing sessionId',
      statusCode: 400,
    });
    return;
  }

  try {
    const session = await Session.findByPk(sessionId);

    if (!session) {
      reply.status(404).send({
        success: false,
        error: 'Session not found',
        statusCode: 404,
      });
      return;
    }

    if (session.hostToken !== token) {
      reply.status(403).send({
        success: false,
        error: 'Invalid host token',
        statusCode: 403,
      });
      return;
    }

    request.session = session;
  } catch (err) {
    logger.error('Auth middleware error', { error: err.message });
    reply.status(500).send({
      success: false,
      error: 'Authentication failed',
      statusCode: 500,
    });
  }
};

module.exports = { hostAuth };
