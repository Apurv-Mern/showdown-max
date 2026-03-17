const { z } = require('zod');
const { createQuestionSchema, updateQuestionSchema } = require('shared/schemas/question');
const { validateBody, validateParams } = require('../middleware/validateRequest');
const { success, error } = require('../utils/responseWrapper');
const questionService = require('../services/questionService');

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
const questionRoutes = async (fastify) => {
  fastify.get('/', async (request) => {
    const { roundId, category, search, page, limit } = request.query;
    const result = await questionService.getQuestions({
      roundId: roundId ? Number(roundId) : undefined,
      category,
      search,
      page: Number(page) || 1,
      limit: Number(limit) || 50,
    });
    return success(result, 'Questions fetched');
  });

  fastify.get('/categories', async () => {
    const categories = await questionService.getCategories();
    return success(categories, 'Categories fetched');
  });

  fastify.get('/:id', {
    preHandler: [validateParams(idParamSchema)],
  }, async (request, reply) => {
    const question = await questionService.getQuestionById(request.params.id);
    if (!question) {
      reply.status(404);
      return error('Question not found', 404);
    }
    return success(question, 'Question fetched');
  });

  fastify.post('/', {
    preHandler: [validateBody(createQuestionSchema)],
  }, async (request, reply) => {
    const question = await questionService.createQuestion(request.body);
    reply.status(201);
    return success(question, 'Question created');
  });

  fastify.post('/bulk', {
    preHandler: [validateBody(z.array(createQuestionSchema).min(1).max(100))],
  }, async (request, reply) => {
    const questions = await questionService.bulkCreateQuestions(request.body);
    reply.status(201);
    return success(questions, `${questions.length} questions created`);
  });

  fastify.put('/:id', {
    preHandler: [validateParams(idParamSchema), validateBody(updateQuestionSchema)],
  }, async (request, reply) => {
    const question = await questionService.updateQuestion(request.params.id, request.body);
    if (!question) {
      reply.status(404);
      return error('Question not found', 404);
    }
    return success(question, 'Question updated');
  });

  fastify.delete('/:id', {
    preHandler: [validateParams(idParamSchema)],
  }, async (request, reply) => {
    const deleted = await questionService.deleteQuestion(request.params.id);
    if (!deleted) {
      reply.status(404);
      return error('Question not found', 404);
    }
    return success(null, 'Question deleted');
  });

  fastify.put('/reorder/:roundId', {
    preHandler: [
      validateParams(z.object({ roundId: z.coerce.number().int().positive() })),
      validateBody(z.object({ questionIds: z.array(z.number().int().positive()).min(1) })),
    ],
  }, async (request) => {
    await questionService.reorderQuestions(request.params.roundId, request.body.questionIds);
    return success(null, 'Questions reordered');
  });
};

module.exports = questionRoutes;
