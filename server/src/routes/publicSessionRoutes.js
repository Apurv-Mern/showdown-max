const { z } = require('zod');
const { validateParams } = require('../middleware/validateRequest');
const { success, error } = require('../utils/responseWrapper');
const sessionService = require('../services/sessionService');

const pinParamSchema = z.object({ pin: z.string().length(6) });

/**
 * Public session routes for unauthenticated clients (venue/player pre-checks).
 * @param {import('fastify').FastifyInstance} fastify
 */
const publicSessionRoutes = async (fastify) => {
  fastify.get('/pin/:pin', {
    preHandler: [validateParams(pinParamSchema)],
  }, async (request, reply) => {
    const forVenue = String(request.query.for || '') === 'venue';
    const session = forVenue
      ? await sessionService.getVenueEligibleSessionByPin(request.params.pin)
      : await sessionService.getSessionByPin(request.params.pin);
    if (!session) {
      reply.status(404);
      return error(
        forVenue
          ? 'Session not found, not active, or no host is assigned to this PIN'
          : 'Session not found or expired',
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
