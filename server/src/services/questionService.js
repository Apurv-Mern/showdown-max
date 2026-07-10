const { Question, Round, Quiz } = require('../models');
const { Op } = require('sequelize');
const { ROUND_TYPES } = require('shared/constants/roundTypes');
const logger = require('../utils/logger');
const mediaReferenceService = require('./mediaReferenceService');

/**
 * @param {number|null|undefined} roundId
 * @returns {Promise<import('sequelize').Model|null>}
 */
const fetchAdminRound = async (roundId) => {
  if (roundId == null || !Number.isFinite(Number(roundId))) return null;
  return Round.findOne({
    where: { id: Number(roundId) },
    include: [{
      model: Quiz,
      as: 'quiz',
      attributes: ['id'],
      where: { isActive: { [Op.not]: false } },
      required: true,
    }],
  });
};

/**
 * MP3/MP4 question media is only allowed on Music rounds (venue audio / observation video).
 * @param {import('sequelize').Model|null} round
 * @param {string|null|undefined} mediaType
 */
const assertMp3Mp4OnlyForMusicRound = (round, mediaType) => {
  if (!mediaType) return;
  const mt = String(mediaType).toLowerCase();
  if (round && round.type === ROUND_TYPES.MUSIC) {
    if (mt !== 'mp3' && mt !== 'mp4') {
      throw Object.assign(
        new Error('Music round questions only support MP3 or MP4 media'),
        { statusCode: 400 },
      );
    }
    return;
  }
  if (mt !== 'mp3' && mt !== 'mp4') return;
  if (!round || round.type !== ROUND_TYPES.MUSIC) {
    throw Object.assign(
      new Error('MP3 and MP4 attachments are only allowed for Music rounds'),
      { statusCode: 400 },
    );
  }
};

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
      include: [{
        model: Quiz,
        as: 'quiz',
        attributes: [],
        where: { isActive: { [Op.not]: false } },
        required: true,
      }],
      where: Object.keys(roundWhere).length > 0 ? roundWhere : undefined,
      required: true,
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
  return Question.findOne({
    where: { id: questionId },
    include: [{
      model: Round,
      as: 'round',
      attributes: ['id', 'name', 'type'],
      include: [{
        model: Quiz,
        as: 'quiz',
        attributes: [],
        where: { isActive: { [Op.not]: false } },
        required: true,
      }],
      required: true,
    }],
  });
};

/**
 * Create a question
 * @param {object} data
 * @returns {Promise<object>}
 */
const createQuestion = async (data) => {
  let round = null;
  if (data.roundId) {
    round = await fetchAdminRound(data.roundId);
    if (!round) throw Object.assign(new Error('Round not found'), { statusCode: 404 });

    const maxOrder = await Question.max('order', { where: { roundId: data.roundId } });
    data.order = (maxOrder ?? -1) + 1;
  }
  assertMp3Mp4OnlyForMusicRound(round, data.mediaType);

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
  for (const row of questions) {
    const rid = row.roundId;
    const round = rid != null ? await fetchAdminRound(rid) : null;
    if (rid != null && !round) {
      throw Object.assign(new Error('Round not found for one or more questions'), { statusCode: 404 });
    }
    assertMp3Mp4OnlyForMusicRound(round, row.mediaType);
  }
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

  if (data.roundId !== undefined) {
    const targetRound = await fetchAdminRound(data.roundId);
    if (!targetRound) {
      throw Object.assign(new Error('Round not found'), { statusCode: 404 });
    }
  }

  const effectiveRoundId =
    data.roundId !== undefined ? Number(data.roundId)
      : question.roundId != null ? Number(question.roundId)
        : null;
  const round =
    effectiveRoundId != null && Number.isFinite(effectiveRoundId)
      ? await fetchAdminRound(effectiveRoundId)
      : null;
  const nextMediaType = data.mediaType !== undefined ? data.mediaType : question.mediaType;
  assertMp3Mp4OnlyForMusicRound(round, nextMediaType);

  const previousFilename = mediaReferenceService.filenameFromMediaUrl(question.mediaUrl);
  const nextMediaUrl = data.mediaUrl !== undefined ? data.mediaUrl : question.mediaUrl;
  const nextFilename = mediaReferenceService.filenameFromMediaUrl(nextMediaUrl);

  await question.update(data);
  logger.info('Question updated', { questionId });

  if (previousFilename && previousFilename !== nextFilename) {
    await mediaReferenceService.deleteFileIfUnreferenced(previousFilename);
  }

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
