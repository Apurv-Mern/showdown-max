const { z } = require('zod');
const { createQuizSchema, updateQuizSchema } = require('shared/schemas/quiz');
const { validateBody, validateParams } = require('../middleware/validateRequest');
const { success, error } = require('../utils/responseWrapper');
const quizService = require('../services/quizService');

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
const quizRoutes = async (fastify) => {
  fastify.get('/', async (request) => {
    const { page, limit, search } = request.query;
    const result = await quizService.getAllQuizzes({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search,
    });
    return success(result, 'Quizzes fetched');
  });

  fastify.get('/:id', {
    preHandler: [validateParams(idParamSchema)],
  }, async (request, reply) => {
    const quiz = await quizService.getQuizById(request.params.id);
    if (!quiz) {
      reply.status(404);
      return error('Quiz not found', 404);
    }
    return success(quiz, 'Quiz fetched');
  });

  fastify.post('/', {
    preHandler: [validateBody(createQuizSchema)],
  }, async (request, reply) => {
    const quiz = await quizService.createQuiz(request.body);
    reply.status(201);
    return success(quiz, 'Quiz created');
  });

  fastify.put('/:id', {
    preHandler: [validateParams(idParamSchema), validateBody(updateQuizSchema)],
  }, async (request, reply) => {
    const quiz = await quizService.updateQuiz(request.params.id, request.body);
    if (!quiz) {
      reply.status(404);
      return error('Quiz not found', 404);
    }
    return success(quiz, 'Quiz updated');
  });

  fastify.delete('/:id', {
    preHandler: [validateParams(idParamSchema)],
  }, async (request, reply) => {
    const deleted = await quizService.deleteQuiz(request.params.id);
    if (!deleted) {
      reply.status(404);
      return error('Quiz not found', 404);
    }
    return success(null, 'Quiz deleted');
  });

  fastify.post('/:id/duplicate', {
    preHandler: [validateParams(idParamSchema)],
  }, async (request, reply) => {
    const quiz = await quizService.duplicateQuiz(request.params.id);
    reply.status(201);
    return success(quiz, 'Quiz duplicated');
  });
};

module.exports = quizRoutes;
