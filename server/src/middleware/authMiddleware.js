const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

/**
 * Extracts and verifies JWT from Authorization header.
 * Attaches decoded payload to request.user.
 */
const verifyToken = async (request, reply) => {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    reply.status(401).send({
      success: false,
      error: 'Authentication required',
      statusCode: 401,
    });
    return;
  }

  try {
    const token = authHeader.split(' ')[1];
    request.user = jwt.verify(token, env.JWT_SECRET);
  } catch {
    reply.status(401).send({
      success: false,
      error: 'Invalid or expired token',
      statusCode: 401,
    });
  }
};

/** Requires admin role (must be used after verifyToken) */
const requireAdmin = async (request, reply) => {
  await verifyToken(request, reply);
  if (reply.sent) return;

  if (request.user.role !== 'admin') {
    reply.status(403).send({
      success: false,
      error: 'Admin access required',
      statusCode: 403,
    });
  }
};

/** Requires host role (must be used after verifyToken) */
const requireHost = async (request, reply) => {
  await verifyToken(request, reply);
  if (reply.sent) return;

  if (request.user.role !== 'host') {
    reply.status(403).send({
      success: false,
      error: 'Host access required',
      statusCode: 403,
    });
  }
};

/** Requires admin or host role */
const requireAdminOrHost = async (request, reply) => {
  await verifyToken(request, reply);
  if (reply.sent) return;

  if (request.user.role !== 'admin' && request.user.role !== 'host') {
    reply.status(403).send({
      success: false,
      error: 'Access denied',
      statusCode: 403,
    });
  }
};

module.exports = { verifyToken, requireAdmin, requireHost, requireAdminOrHost };
