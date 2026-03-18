const { Question, Round } = require('../models');
const logger = require('../utils/logger');

/**
 * Get questions with optional filters
 * @param {{ roundId?: number, roundType?: string, category?: string, search?: string, page?: number, limit?: number }} options
 * @returns {Promise<{ questions: object[], total: number }>}
 */
const getQuestions = async ({ roundId, roundType, category, search, page = 1, limit = 50 } = {}) => {
  const { Op } = require('sequelize');
  const where = {};
  const roundWhere = {};

  if (roundId) where.roundId = roundId;
  if (roundType) roundWhere.type = roundType;
  if (category) where.category = category;
  if (search) where.text = { [Op.like]: `%${search}%` };

  const offset = (page - 1) * limit;
  const { rows, count } = await Question.findAndCountAll({
    where,
    include: [{
      model: Round,
      as: 'round',
      attributes: ['id', 'name', 'type'],
      where: Object.keys(roundWhere).length > 0 ? roundWhere : undefined,
    }],
    order: [['order', 'ASC'], ['createdAt', 'DESC']],
    limit,
    offset,
  });

  return { questions: rows, total: count };
};

/**
 * Get a single question by ID
 * @param {number} questionId
 * @returns {Promise<object | null>}
 */
const getQuestionById = async (questionId) => {
  return Question.findByPk(questionId, {
    include: [{ model: Round, as: 'round', attributes: ['id', 'name', 'type'] }],
  });
};

/**
 * Create a question
 * @param {object} data
 * @returns {Promise<object>}
 */
const createQuestion = async (data) => {
  if (data.roundId) {
    const round = await Round.findByPk(data.roundId);
    if (!round) throw Object.assign(new Error('Round not found'), { statusCode: 404 });

    const maxOrder = await Question.max('order', { where: { roundId: data.roundId } });
    data.order = (maxOrder ?? -1) + 1;
  }

  const question = await Question.create(data);
  logger.info('Question created', { questionId: question.id });
  return getQuestionById(question.id);
};

/**
 * Create multiple questions at once (bulk import)
 * @param {object[]} questions
 * @returns {Promise<object[]>}
 */
const bulkCreateQuestions = async (questions) => {
  const created = await Question.bulkCreate(questions);
  logger.info('Bulk questions created', { count: created.length });
  return created;
};

/**
 * Update a question
 * @param {number} questionId
 * @param {object} data
 * @returns {Promise<object | null>}
 */
const updateQuestion = async (questionId, data) => {
  const question = await Question.findByPk(questionId);
  if (!question) return null;

  await question.update(data);
  logger.info('Question updated', { questionId });
  return getQuestionById(questionId);
};

/**
 * Delete a question
 * @param {number} questionId
 * @returns {Promise<boolean>}
 */
const deleteQuestion = async (questionId) => {
  const question = await Question.findByPk(questionId);
  if (!question) return false;
  await question.destroy();
  logger.info('Question deleted', { questionId });
  return true;
};

/**
 * Reorder questions within a round
 * @param {number} roundId
 * @param {number[]} questionIds - Ordered array of question IDs
 */
const reorderQuestions = async (roundId, questionIds) => {
  const promises = questionIds.map((id, index) =>
    Question.update({ order: index }, { where: { id, roundId } }),
  );
  await Promise.all(promises);
  logger.info('Questions reordered', { roundId, count: questionIds.length });
};

/**
 * Get distinct categories
 * @returns {Promise<string[]>}
 */
const getCategories = async () => {
  const results = await Question.findAll({
    attributes: [[require('sequelize').fn('DISTINCT', require('sequelize').col('category')), 'category']],
    where: { category: { [require('sequelize').Op.ne]: null } },
    raw: true,
  });
  return results.map((r) => r.category).filter(Boolean);
};

module.exports = {
  getQuestions,
  getQuestionById,
  createQuestion,
  bulkCreateQuestions,
  updateQuestion,
  deleteQuestion,
  reorderQuestions,
  getCategories,
};
