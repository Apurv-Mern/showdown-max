const { z } = require('zod');
const { Round, Quiz, Question } = require('../models');
const { success, error } = require('../utils/responseWrapper');
const { validateParams } = require('../middleware/validateRequest');

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
const roundRoutes = async (fastify) => {
  fastify.get('/', async (request) => {
    const { quizId } = request.query;
    const where = {};
    if (quizId) where.quizId = Number(quizId);

    const rounds = await Round.findAll({
      where,
      include: [
        { model: Quiz, as: 'quiz', attributes: ['id', 'title'] },
      ],
      attributes: {
        include: [
          [
            require('sequelize').literal(
              '(SELECT COUNT(*) FROM questions WHERE questions.roundId = Round.id)',
            ),
            'questionCount',
          ],
        ],
      },
      order: [['quizId', 'ASC'], ['order', 'ASC']],
    });

    return success(rounds, 'Rounds fetched');
  });

  fastify.get('/:id', {
    preHandler: [validateParams(z.object({ id: z.coerce.number().int().positive() }))],
  }, async (request, reply) => {
    const round = await Round.findByPk(request.params.id, {
      include: [
        { model: Quiz, as: 'quiz', attributes: ['id', 'title'] },
        { model: Question, as: 'questions', order: [['order', 'ASC']] },
      ],
    });

    if (!round) {
      reply.status(404);
      return error('Round not found', 404);
    }

    return success(round, 'Round fetched');
  });
};

module.exports = roundRoutes;
