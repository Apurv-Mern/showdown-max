const { z } = require('zod');
const { Op } = require('sequelize');
const { ROUND_TYPES } = require('shared/constants/roundTypes');
const { Round, Quiz, Question, sequelize } = require('../models');
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

const reorderRoundsSchema = z.object({
  roundIds: z.array(z.number().int().positive()).length(7),
});

const reorderRoundsParamsSchema = z.object({
  quizId: z.coerce.number().int().positive(),
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
        {
          model: Quiz,
          as: 'quiz',
          attributes: ['id', 'title'],
          where: { isActive: { [Op.not]: false } },
          required: true,
        },
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
      order: [
        ['quizId', 'ASC'],
        ['order', 'ASC'],
      ],
    });

    return success(rounds, 'Rounds fetched');
  });

  fastify.post(
    '/',
    {
      preHandler: [validateBody(createRoundSchema)],
    },
    async (request, reply) => {
      const { quizId, name, type, order, timerDuration } = request.body;

      const quiz = await Quiz.findOne({
        where: { id: quizId, isActive: { [Op.not]: false } },
      });
      if (!quiz) {
        reply.status(404);
        return error('Quiz not found', 404);
      }

      const existingRoundCount = await Round.count({ where: { quizId } });
      if (existingRoundCount >= 7) {
        reply.status(400);
        return error('A quiz can have a maximum of 7 rounds', 400);
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
    },
  );

  fastify.patch(
    '/:id',
    {
      preHandler: [validateParams(idParamSchema), validateBody(patchRoundSchema)],
    },
    async (request, reply) => {
      const round = await Round.findOne({
        where: { id: request.params.id },
        include: [
          {
            model: Quiz,
            as: 'quiz',
            attributes: ['id'],
            where: { isActive: { [Op.not]: false } },
            required: true,
          },
        ],
      });
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
          {
            model: Quiz,
            as: 'quiz',
            attributes: ['id', 'title'],
            where: { isActive: { [Op.not]: false } },
            required: true,
          },
          { model: Question, as: 'questions', order: [['order', 'ASC']] },
        ],
      });

      return success(updated, 'Round updated');
    },
  );

  fastify.put(
    '/reorder/:quizId',
    {
      preHandler: [validateParams(reorderRoundsParamsSchema), validateBody(reorderRoundsSchema)],
    },
    async (request, reply) => {
      const { quizId } = request.params;
      const { roundIds } = request.body;

      const quiz = await Quiz.findOne({
        where: { id: quizId, isActive: { [Op.not]: false } },
        attributes: ['id'],
      });
      if (!quiz) {
        reply.status(404);
        return error('Quiz not found', 404);
      }

      const rounds = await Round.findAll({
        where: { quizId },
        attributes: ['id', 'order'],
        order: [['order', 'ASC']],
      });

      if (rounds.length !== 7) {
        reply.status(400);
        return error('Quiz must contain exactly 7 rounds', 400);
      }

      const currentIds = rounds.map((round) => round.id);
      const currentSet = new Set(currentIds);
      const incomingSet = new Set(roundIds);

      if (incomingSet.size !== roundIds.length) {
        reply.status(400);
        return error('Duplicate round IDs are not allowed', 400);
      }

      const isSameSet =
        roundIds.length === currentIds.length &&
        roundIds.every((id) => currentSet.has(id)) &&
        currentIds.every((id) => incomingSet.has(id));

      if (!isSameSet) {
        reply.status(400);
        return error('roundIds must contain all quiz round IDs exactly once', 400);
      }

      await sequelize.transaction(async (transaction) => {
        await Promise.all(
          roundIds.map((roundId, index) =>
            Round.update({ order: index }, { where: { id: roundId, quizId }, transaction }),
          ),
        );
      });

      return success(null, 'Rounds reordered');
    },
  );

  fastify.get(
    '/:id',
    {
      preHandler: [validateParams(z.object({ id: z.coerce.number().int().positive() }))],
    },
    async (request, reply) => {
      const round = await Round.findOne({
        where: { id: request.params.id },
        include: [
          {
            model: Quiz,
            as: 'quiz',
            attributes: ['id', 'title'],
            where: { isActive: { [Op.not]: false } },
            required: true,
          },
          { model: Question, as: 'questions', order: [['order', 'ASC']] },
        ],
      });

      if (!round) {
        reply.status(404);
        return error('Round not found', 404);
      }

      return success(round, 'Round fetched');
    },
  );

  fastify.delete(
    '/:id',
    {
      preHandler: [validateParams(idParamSchema)],
    },
    async (request, reply) => {
      const round = await Round.findOne({
        where: { id: request.params.id },
        include: [
          {
            model: Quiz,
            as: 'quiz',
            attributes: ['id'],
            where: { isActive: { [Op.not]: false } },
            required: true,
          },
          { model: Question, as: 'questions', attributes: ['id'] },
        ],
      });

      if (!round) {
        reply.status(404);
        return error('Round not found', 404);
      }

      const quizId = round.quizId;
      const roundOrder = round.order;

      if (round.questions?.length) {
        await Question.destroy({ where: { roundId: round.id } });
      }

      await round.destroy();

      const remainingRounds = await Round.findAll({
        where: { quizId },
        order: [['order', 'ASC']],
      });

      await Promise.all(
        remainingRounds.map((remainingRound, index) => remainingRound.update({ order: index })),
      );

      return success(
        {
          deletedRoundId: request.params.id,
          quizId,
          deletedOrder: roundOrder,
          remainingRounds: remainingRounds.length,
        },
        'Round deleted',
      );
    },
  );
};

module.exports = roundRoutes;
