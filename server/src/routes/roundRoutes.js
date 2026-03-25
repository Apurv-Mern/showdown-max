const { z } = require('zod');
const { ROUND_TYPES } = require('shared/constants/roundTypes');
const { Round, Quiz, Question } = require('../models');
const { success, error } = require('../utils/responseWrapper');
const { validateParams, validateBody } = require('../middleware/validateRequest');

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const createRoundSchema = z.object({
  quizId: z.number().int().positive(),
  name: z.string().min(1).max(100),
  type: z.nativeEnum(ROUND_TYPES),
  order: z.number().int().min(0).optional(),
  timerDuration: z.number().int().min(5).max(300).optional().default(30),
});

const patchRoundSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.nativeEnum(ROUND_TYPES).optional(),
  timerDuration: z.number().int().min(5).max(300).optional(),
});

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

  fastify.post('/', {
    preHandler: [validateBody(createRoundSchema)],
  }, async (request, reply) => {
    const { quizId, name, type, order, timerDuration } = request.body;

    const quiz = await Quiz.findByPk(quizId);
    if (!quiz) {
      reply.status(404);
      return error('Quiz not found', 404);
    }

    let nextOrder = order;
    if (nextOrder === undefined) {
      const max = await Round.max('order', { where: { quizId } });
      nextOrder = max == null ? 0 : Number(max) + 1;
    }

    const round = await Round.create({
      quizId,
      name,
      type,
      order: nextOrder,
      timerDuration: timerDuration ?? 30,
    });

    reply.status(201);
    return success(round, 'Round created');
  });

  fastify.patch('/:id', {
    preHandler: [validateParams(idParamSchema), validateBody(patchRoundSchema)],
  }, async (request, reply) => {
    const round = await Round.findByPk(request.params.id);
    if (!round) {
      reply.status(404);
      return error('Round not found', 404);
    }

    const { name, type, timerDuration } = request.body;
    await round.update({
      ...(name !== undefined ? { name } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(timerDuration !== undefined ? { timerDuration } : {}),
    });

    const updated = await Round.findByPk(round.id, {
      include: [
        { model: Quiz, as: 'quiz', attributes: ['id', 'title'] },
        { model: Question, as: 'questions', order: [['order', 'ASC']] },
      ],
    });

    return success(updated, 'Round updated');
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
