const { Quiz, Round, Question, sequelize } = require('../models');
const logger = require('../utils/logger');

/**
 * Get all quizzes with round count
 * @param {{ page?: number, limit?: number, search?: string }} options
 * @returns {Promise<{ quizzes: object[], total: number }>}
 */
const getAllQuizzes = async ({ page = 1, limit = 20, search } = {}) => {
  const where = {
    isActive: true,
  };
  if (search) {
    const { Op } = require('sequelize');
    where.title = { [Op.like]: `%${search}%` };
  }

  const offset = (page - 1) * limit;
  const { rows, count } = await Quiz.findAndCountAll({
    where,
    include: [{
      model: Round,
      as: 'rounds',
      attributes: ['id', 'name', 'type', 'order', 'timerDuration'],
    }],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  return { quizzes: rows, total: count };
};

/**
 * Get a single quiz with all rounds and questions
 * @param {number} quizId
 * @returns {Promise<object | null>}
 */
const getQuizById = async (quizId) => {
  return Quiz.findOne({
    where: {
      id: quizId,
      isActive: true,
    },
    include: [{
      model: Round,
      as: 'rounds',
      include: [{
        model: Question,
        as: 'questions',
        order: [['order', 'ASC']],
      }],
      order: [['order', 'ASC']],
    }],
    order: [
      [{ model: Round, as: 'rounds' }, 'order', 'ASC'],
      [{ model: Round, as: 'rounds' }, { model: Question, as: 'questions' }, 'order', 'ASC'],
    ],
  });
};

/**
 * Create a quiz with rounds (questions added separately)
 * @param {{ title: string, description?: string, rounds: object[] }} data
 * @returns {Promise<object>}
 */
const createQuiz = async (data) => {
  const transaction = await sequelize.transaction();

  try {
    const quiz = await Quiz.create({
      title: data.title,
      description: data.description,
    }, { transaction });

    if (data.rounds?.length) {
      const roundRecords = data.rounds.map((r, idx) => ({
        quizId: quiz.id,
        name: r.name,
        type: r.type,
        order: r.order ?? idx,
        timerDuration: r.timerDuration ?? 30,
      }));
      await Round.bulkCreate(roundRecords, { transaction });
    }

    await transaction.commit();
    logger.info('Quiz created', { quizId: quiz.id, title: quiz.title });
    return getQuizById(quiz.id);
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

/**
 * Update quiz metadata and optionally replace rounds
 * @param {number} quizId
 * @param {object} data
 * @returns {Promise<object | null>}
 */
const updateQuiz = async (quizId, data) => {
  const transaction = await sequelize.transaction();

  try {
    const quiz = await Quiz.findOne({
      where: { id: quizId, isActive: true },
      transaction,
    });
    if (!quiz) {
      await transaction.rollback();
      return null;
    }

    await quiz.update({
      title: data.title ?? quiz.title,
      description: data.description ?? quiz.description,
    }, { transaction });

    if (data.rounds) {
      await Round.destroy({ where: { quizId }, transaction });

      const roundRecords = data.rounds.map((r, idx) => ({
        quizId,
        name: r.name,
        type: r.type,
        order: r.order ?? idx,
        timerDuration: r.timerDuration ?? 30,
      }));
      await Round.bulkCreate(roundRecords, { transaction });
    }

    await transaction.commit();
    logger.info('Quiz updated', { quizId });
    return getQuizById(quizId);
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

/**
 * Soft-delete quiz (set isActive = false)
 * @param {number} quizId
 * @returns {Promise<boolean>}
 */
const deleteQuiz = async (quizId) => {
  const quiz = await Quiz.findOne({
    where: { id: quizId, isActive: true },
  });
  if (!quiz) return false;
  await quiz.update({ isActive: false });
  logger.info('Quiz deactivated', { quizId });
  return true;
};

/**
 * Duplicate a quiz with all rounds and questions
 * @param {number} quizId
 * @returns {Promise<object>}
 */
const duplicateQuiz = async (quizId) => {
  const transaction = await sequelize.transaction();

  try {
    const original = await getQuizById(quizId);
    if (!original) throw new Error('Quiz not found');

    const newQuiz = await Quiz.create({
      title: `${original.title} (Copy)`,
      description: original.description,
    }, { transaction });

    for (const round of original.rounds) {
      const newRound = await Round.create({
        quizId: newQuiz.id,
        name: round.name,
        type: round.type,
        order: round.order,
        timerDuration: round.timerDuration,
      }, { transaction });

      if (round.questions?.length) {
        const questions = round.questions.map((q) => ({
          roundId: newRound.id,
          text: q.text,
          options: q.options,
          category: q.category,
          mediaUrl: q.mediaUrl,
          mediaType: q.mediaType,
          order: q.order,
        }));
        await Question.bulkCreate(questions, { transaction });
      }
    }

    await transaction.commit();
    logger.info('Quiz duplicated', { originalId: quizId, newId: newQuiz.id });
    return getQuizById(newQuiz.id);
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

module.exports = {
  getAllQuizzes,
  getQuizById,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  duplicateQuiz,
};
