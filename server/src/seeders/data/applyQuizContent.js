'use strict';

const { ensureSeedMediaUrls } = require('./seedMedia');
const {
  getQuestionsCountForRound,
  resolveQuestionTemplate,
  materializeQuestion,
} = require('./questionBank');

async function applyContentToRound(queryInterface, round, mediaUrls, now = new Date()) {
  const questionCount = getQuestionsCountForRound(round.type);
  const [questionRows] = await queryInterface.sequelize.query(
    'SELECT id, `order` FROM questions WHERE roundId = :roundId ORDER BY `order` ASC',
    { replacements: { roundId: round.id } },
  );

  for (const questionRow of questionRows) {
    const template = resolveQuestionTemplate(round.type, questionRow.order);
    const materialized = materializeQuestion(template, mediaUrls);
    if (!materialized) continue;

    await queryInterface.bulkUpdate(
      'questions',
      {
        text: materialized.text,
        options: JSON.stringify(materialized.options),
        category: materialized.category,
        mediaUrl: materialized.mediaUrl,
        mediaType: materialized.mediaType,
        updatedAt: now,
      },
      { id: questionRow.id },
    );
  }

  if (questionRows.length > questionCount) {
    await queryInterface.sequelize.query(
      'DELETE FROM questions WHERE roundId = :roundId AND `order` >= :count',
      { replacements: { roundId: round.id, count: questionCount } },
    );
  }
}

async function applyContentToQuizzes(queryInterface, quizIds) {
  const mediaUrls = await ensureSeedMediaUrls();
  const now = new Date();

  for (const quizId of quizIds) {
    const [roundRows] = await queryInterface.sequelize.query(
      'SELECT id, type, `order` FROM rounds WHERE quizId = :quizId ORDER BY `order` ASC',
      { replacements: { quizId } },
    );

    for (const round of roundRows) {
      await applyContentToRound(queryInterface, round, mediaUrls, now);
    }
  }
}

module.exports = {
  applyContentToQuizzes,
  applyContentToRound,
};
