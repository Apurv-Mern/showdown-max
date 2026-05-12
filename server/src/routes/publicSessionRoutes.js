const { z } = require('zod');
const { validateParams } = require('../middleware/validateRequest');
const { success, error } = require('../utils/responseWrapper');
const sessionService = require('../services/sessionService');

const pinParamSchema = z.object({ pin: z.string().length(6) });

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
};

module.exports = publicSessionRoutes;
