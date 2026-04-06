const { z } = require('zod');
const { createSessionSchema } = require('shared/schemas/session');
const { validateBody, validateParams } = require('../middleware/validateRequest');
const { success, error } = require('../utils/responseWrapper');
const sessionService = require('../services/sessionService');

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const pinParamSchema = z.object({ pin: z.string().length(6) });

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
const sessionRoutes = async (fastify) => {
  const hostSessionId = (request) =>
    request.user?.role === 'host' && request.user?.sessionId ? Number(request.user.sessionId) : null;

  fastify.get('/', async (request) => {
    const { status, page, limit } = request.query;
    const sessionIdForHost = hostSessionId(request) || undefined;
    const result = await sessionService.getSessions({
      status,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      sessionId: sessionIdForHost,
    });
    return success(result, 'Sessions fetched');
  });

  fastify.get('/:id', {
    preHandler: [validateParams(idParamSchema)],
  }, async (request, reply) => {
    if (hostSessionId(request) && hostSessionId(request) !== Number(request.params.id)) {
      reply.status(403);
      return error('Access denied for this session', 403);
    }

    const session = await sessionService.getSessionById(request.params.id);
    if (!session) {
      reply.status(404);
      return error('Session not found', 404);
    }
    return success(session, 'Session fetched');
  });

  fastify.post('/', {
    preHandler: [validateBody(createSessionSchema)],
  }, async (request, reply) => {
    if (request.user?.role !== 'admin') {
      reply.status(403);
      return error('Admin access required', 403);
    }

    try {
      const session = await sessionService.createSession(request.body);
      reply.status(201);
      return success(session, 'Session created');
    } catch (err) {
      const statusCode = err.statusCode || 500;
      reply.status(statusCode);
      return error(err.message, statusCode);
    }
  });

  fastify.get('/pin/:pin', {
    preHandler: [validateParams(pinParamSchema)],
  }, async (request, reply) => {
    const session = await sessionService.getSessionByPin(request.params.pin);
    if (!session) {
      reply.status(404);
      return error('Session not found or expired', 404);
    }
    return success({
      id: session.id,
      pin: session.pin,
      status: session.status,
      quizTitle: session.quiz?.title,
      maxTeams: session.maxTeams,
    }, 'Session found');
  });

  fastify.post('/:id/end', {
    preHandler: [validateParams(idParamSchema)],
  }, async (request, reply) => {
    if (hostSessionId(request) && hostSessionId(request) !== Number(request.params.id)) {
      reply.status(403);
      return error('Access denied for this session', 403);
    }

    const session = await sessionService.endSession(request.params.id);
    if (!session) {
      reply.status(404);
      return error('Session not found', 404);
    }
    return success(null, 'Session ended');
  });

  fastify.delete('/:id', {
    preHandler: [validateParams(idParamSchema)],
  }, async (request, reply) => {
    if (request.user?.role !== 'admin') {
      reply.status(403);
      return error('Admin access required', 403);
    }

    const session = await sessionService.deleteSession(request.params.id);
    if (!session) {
      reply.status(404);
      return error('Session not found', 404);
    }
    return success(null, 'Session deleted');
  });

  fastify.get('/:id/results', {
    preHandler: [validateParams(idParamSchema)],
  }, async (request, reply) => {
    if (hostSessionId(request) && hostSessionId(request) !== Number(request.params.id)) {
      reply.status(403);
      return error('Access denied for this session', 403);
    }

    const results = await sessionService.getSessionResults(request.params.id);
    if (!results) {
      reply.status(404);
      return error('Session not found', 404);
    }
    return success(results, 'Session results fetched');
  });
};

module.exports = sessionRoutes;
