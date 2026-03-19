const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { env } = require('../config/env');
const { validateBody } = require('../middleware/validateRequest');
const { success } = require('../utils/responseWrapper');
const logger = require('../utils/logger');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  role: z.enum(['admin', 'host']),
});

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
const authRoutes = async (fastify) => {
  fastify.post('/login', {
    preHandler: [validateBody(loginSchema)],
  }, async (request, reply) => {
    const { email, password, role } = request.body;

    let validEmail;
    let validPassword;

    if (role === 'admin') {
      validEmail = env.ADMIN_EMAIL;
      validPassword = env.ADMIN_PASSWORD;
    } else {
      validEmail = env.HOST_EMAIL;
      validPassword = env.HOST_PASSWORD;
    }

    if (email !== validEmail || password !== validPassword) {
      reply.status(401);
      return { success: false, error: 'Invalid email or password', statusCode: 401 };
    }

    const token = jwt.sign(
      { role, email },
      env.JWT_SECRET,
      { expiresIn: '24h' },
    );

    logger.info(`${role} logged in`, { email });

    return success({ token, role }, 'Login successful');
  });

  fastify.get('/me', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      reply.status(401);
      return { success: false, error: 'No token provided', statusCode: 401 };
    }

    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], env.JWT_SECRET);
      return success({ role: decoded.role, email: decoded.email }, 'Authenticated');
    } catch {
      reply.status(401);
      return { success: false, error: 'Invalid or expired token', statusCode: 401 };
    }
  });
};

module.exports = authRoutes;
