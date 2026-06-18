const { z } = require('zod');
const { validateBody, validateParams } = require('../middleware/validateRequest');
const { success, error } = require('../utils/responseWrapper');
const teamService = require('../services/teamService');
const { Team } = require('../models');

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const sessionIdParamSchema = z.object({ sessionId: z.coerce.number().int().positive() });

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
const createTeamSchema = z.object({
  sessionId: z.number().int().positive(),
  teamName: z.string().trim().min(1).max(50),
  score: z.number().int().optional().default(0),
});

const teamRoutes = async (fastify) => {
  const hostSessionId = (request) =>
    request.user?.role === 'host' && request.user?.sessionId ? Number(request.user.sessionId) : null;

  fastify.post('/', {
    preHandler: [validateBody(createTeamSchema)],
  }, async (request, reply) => {
    if (hostSessionId(request) && Number(request.body.sessionId) !== hostSessionId(request)) {
      reply.status(403);
      return error('Access denied for this session', 403);
    }

    const team = await teamService.createTeam(request.body);
    if (!team) {
      reply.status(400);
      return error('Failed to create team — name may already be taken in this session', 400);
    }
    return success(team, 'Team created');
  });

  fastify.get('/session/:sessionId', {
    preHandler: [validateParams(sessionIdParamSchema)],
  }, async (request, reply) => {
    if (hostSessionId(request) && Number(request.params.sessionId) !== hostSessionId(request)) {
      reply.status(403);
      return error('Access denied for this session', 403);
    }

    const teams = await teamService.getTeamsBySession(request.params.sessionId);
    return success(teams, 'Teams fetched');
  });

  fastify.get('/:id', {
    preHandler: [validateParams(idParamSchema)],
  }, async (request, reply) => {
    if (request.user?.role === 'host') {
      const raw = await Team.findByPk(request.params.id, { attributes: ['sessionId'] });
      if (!raw || Number(raw.sessionId) !== hostSessionId(request)) {
        reply.status(403);
        return error('Access denied for this team', 403);
      }
    }

    const team = await teamService.getTeamById(request.params.id);
    if (!team) {
      reply.status(404);
      return error('Team not found', 404);
    }
    return success(team, 'Team fetched');
  });

  fastify.put('/:id/score', {
    preHandler: [
      validateParams(idParamSchema),
      validateBody(z.object({ score: z.number().int() })),
    ],
  }, async (request, reply) => {
    if (request.user?.role === 'host') {
      const raw = await Team.findByPk(request.params.id, { attributes: ['sessionId'] });
      if (!raw || Number(raw.sessionId) !== hostSessionId(request)) {
        reply.status(403);
        return error('Access denied for this team', 403);
      }
    }

    const team = await teamService.updateTeamScore(request.params.id, request.body.score);
    if (!team) {
      reply.status(404);
      return error('Team not found', 404);
    }
    return success(team, 'Team score updated');
  });

  fastify.delete('/:id', {
    preHandler: [validateParams(idParamSchema)],
  }, async (request, reply) => {
    if (request.user?.role === 'host') {
      const raw = await Team.findByPk(request.params.id, { attributes: ['sessionId'] });
      if (!raw || Number(raw.sessionId) !== hostSessionId(request)) {
        reply.status(403);
        return error('Access denied for this team', 403);
      }
    }

    const deleted = await teamService.removeTeam(request.params.id);
    if (!deleted) {
      reply.status(404);
      return error('Team not found', 404);
    }
    return success(null, 'Team removed');
  });
};

module.exports = teamRoutes;
