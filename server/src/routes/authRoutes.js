const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { z } = require('zod');
const { env } = require('../config/env');
const { validateBody } = require('../middleware/validateRequest');
const { success } = require('../utils/responseWrapper');
const logger = require('../utils/logger');
const { HostAccount, Session } = require('../models');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  role: z.enum(['admin', 'host']),
});

const hashPassword = (password) => crypto.createHash('sha256').update(password).digest('hex');

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
const authRoutes = async (fastify) => {
  fastify.post('/login', {
    preHandler: [validateBody(loginSchema)],
  }, async (request, reply) => {
    const { email, password, role } = request.body;

    if (role === 'admin') {
      if (email !== env.ADMIN_EMAIL || password !== env.ADMIN_PASSWORD) {
        reply.status(401);
        return { success: false, error: 'Invalid email or password', statusCode: 401 };
      }

      const token = jwt.sign(
        { role, email },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN || '7d' },
      );

      logger.info(`${role} logged in`, { email });
      return success({ token, role }, 'Login successful');
    }

    const hostAccount = await HostAccount.findOne({
      where: { email, isActive: true },
      include: [{ model: Session, as: 'assignedSession', attributes: ['id', 'pin', 'status'] }],
    });

    if (!hostAccount || hostAccount.passwordHash !== hashPassword(password)) {
      reply.status(401);
      return { success: false, error: 'Invalid email or password', statusCode: 401 };
    }

    if (!hostAccount.sessionId || !hostAccount.assignedSession) {
      reply.status(403);
      return { success: false, error: 'No session assigned for this host account', statusCode: 403 };
    }

    const token = jwt.sign(
      { role, email, hostAccountId: hostAccount.id, sessionId: hostAccount.sessionId },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN || '7d' },
    );

    logger.info('host logged in', { email, hostAccountId: hostAccount.id, sessionId: hostAccount.sessionId });

    return success({
      token,
      role,
      assignedSession: {
        id: hostAccount.assignedSession.id,
        pin: hostAccount.assignedSession.pin,
        status: hostAccount.assignedSession.status,
      },
    }, 'Login successful');
  });

  fastify.get('/me', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      reply.status(401);
      return { success: false, error: 'No token provided', statusCode: 401 };
    }

    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], env.JWT_SECRET);

      if (decoded.role === 'host' && decoded.hostAccountId) {
        const hostAccount = await HostAccount.findOne({
          where: { id: decoded.hostAccountId, isActive: true },
          include: [{ model: Session, as: 'assignedSession', attributes: ['id', 'pin', 'status'] }],
        });

        if (!hostAccount) {
          reply.status(401);
          return { success: false, error: 'Invalid or expired token', statusCode: 401 };
        }

        return success({
          role: decoded.role,
          email: hostAccount.email,
          assignedSession: hostAccount.assignedSession
            ? {
                id: hostAccount.assignedSession.id,
                pin: hostAccount.assignedSession.pin,
                status: hostAccount.assignedSession.status,
              }
            : null,
        }, 'Authenticated');
      }

      return success({ role: decoded.role, email: decoded.email }, 'Authenticated');
    } catch {
      reply.status(401);
      return { success: false, error: 'Invalid or expired token', statusCode: 401 };
    }
  });
};

module.exports = authRoutes;
