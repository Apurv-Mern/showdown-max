const { z } = require('zod');
const { validateBody, validateParams } = require('../middleware/validateRequest');
const { success, error } = require('../utils/responseWrapper');
const sessionService = require('../services/sessionService');
const { Team } = require('../models');
const gameController = require('../services/game-engine/gameController');
const { getSocketIo } = require('../socket/ioRegistry');

const pinParamSchema = z.object({ pin: z.string().length(6) });
const leaveIntentBodySchema = z.object({
  teamId: z.coerce.number().int().positive(),
});

/**
 * Public session routes for unauthenticated clients (venue/player pre-checks).
 * Query `for`: `venue` — same as default (host-ready session); `exists` — row exists pending/active only.
 * @param {import('fastify').FastifyInstance} fastify
 */
const publicSessionRoutes = async (fastify) => {
  fastify.get('/pin/:pin', {
    preHandler: [validateParams(pinParamSchema)],
  }, async (request, reply) => {
    const forParam = String(request.query.for || '');
    const forExistsOnly = forParam === 'exists';
    const pin = request.params.pin;
    const session = forExistsOnly
      ? await sessionService.getSessionByPin(pin)
      : await sessionService.getPlayerJoinEligibleSessionByPin(pin);
    if (!session) {
      reply.status(404);
      return error(
        forExistsOnly
          ? 'Session not found or expired'
          : 'Session not found, not active, or no host is assigned to this PIN',
        404,
      );
    }
    return success({
      id: session.id,
      pin: session.pin,
      status: session.status,
      quizTitle: session.quiz?.title,
    }, 'Session found');
  });

  fastify.post('/pin/:pin/leave-intent', {
    preHandler: [validateParams(pinParamSchema), validateBody(leaveIntentBodySchema)],
  }, async (request) => {
    const pin = String(request.params.pin || '');
    const teamId = Number(request.body.teamId);
    const io = getSocketIo();

    if (!io || !pin || !Number.isFinite(teamId)) {
      return success({ accepted: false }, 'Leave intent ignored');
    }

    // Safety: only purge if this team currently belongs to the same PIN session.
    const session = await sessionService.getSessionByPin(pin);
    if (!session) return success({ accepted: false }, 'Leave intent ignored');

    const team = await Team.findByPk(teamId, { attributes: ['id', 'sessionId'] });
    if (!team || Number(team.sessionId) !== Number(session.id)) {
      return success({ accepted: false }, 'Leave intent ignored');
    }

    await gameController.handlePlayerSocketDisconnect(io, pin, teamId, { immediate: true });
    return success({ accepted: true }, 'Leave intent processed');
  });
};

module.exports = publicSessionRoutes;
