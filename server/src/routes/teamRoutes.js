const { z } = require('zod');
const { validateBody, validateParams } = require('../middleware/validateRequest');
const { success, error } = require('../utils/responseWrapper');
const teamService = require('../services/teamService');

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const sessionIdParamSchema = z.object({ sessionId: z.coerce.number().int().positive() });

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
const teamRoutes = async (fastify) => {
  fastify.get('/session/:sessionId', {
    preHandler: [validateParams(sessionIdParamSchema)],
  }, async (request) => {
    const teams = await teamService.getTeamsBySession(request.params.sessionId);
    return success(teams, 'Teams fetched');
  });

  fastify.get('/:id', {
    preHandler: [validateParams(idParamSchema)],
  }, async (request, reply) => {
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
    const deleted = await teamService.removeTeam(request.params.id);
    if (!deleted) {
      reply.status(404);
      return error('Team not found', 404);
    }
    return success(null, 'Team removed');
  });
};

module.exports = teamRoutes;
