'use strict';

const {
  QUIZ_TITLE_PREFIX,
  QUIZ_DEFINITIONS,
  ROUND_BLUEPRINT,
  getQuestionsCountForRound,
  resolveQuestionTemplate,
  materializeQuestion,
} = require('./data/questionBank');
const { ensureSeedMediaUrls } = require('./data/seedMedia');

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const mediaUrls = await ensureSeedMediaUrls();

    for (const quizDef of QUIZ_DEFINITIONS) {
      const quizNo = quizDef.code;
      const title = quizDef.title;
      const description = quizDef.description;

      const [existingQuizRows] = await queryInterface.sequelize.query(
        'SELECT id FROM quizzes WHERE title = :title OR title = :legacyTitle LIMIT 1',
        {
          replacements: {
            title,
            legacyTitle: `${QUIZ_TITLE_PREFIX} ${quizNo}`,
          },
        },
      );

      if (existingQuizRows.length > 0) {
        continue;
      }

      await queryInterface.bulkInsert('quizzes', [{
        title,
        description,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      }]);

      const [quizRows] = await queryInterface.sequelize.query(
        'SELECT id FROM quizzes WHERE title = :title ORDER BY id DESC LIMIT 1',
        { replacements: { title } },
      );
      const quizId = quizRows[0].id;

      const roundRows = ROUND_BLUEPRINT.map((round, index) => ({
        quizId,
        name: round.name,
        type: round.type,
        order: index,
        timerDuration: round.timerDuration,
        createdAt: now,
        updatedAt: now,
      }));

      await queryInterface.bulkInsert('rounds', roundRows);

      const [createdRounds] = await queryInterface.sequelize.query(
        'SELECT id, name, type FROM rounds WHERE quizId = :quizId ORDER BY `order` ASC',
        { replacements: { quizId } },
      );

      const questions = [];
      for (const round of createdRounds) {
        const questionCount = getQuestionsCountForRound(round.type);
        for (let qIdx = 0; qIdx < questionCount; qIdx += 1) {
          const template = resolveQuestionTemplate(round.type, qIdx);
          const materialized = materializeQuestion(template, mediaUrls);
          if (!materialized) continue;

          questions.push({
            roundId: round.id,
            text: materialized.text,
            options: JSON.stringify(materialized.options),
            category: materialized.category,
            mediaUrl: materialized.mediaUrl,
            mediaType: materialized.mediaType,
            order: qIdx,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      await queryInterface.bulkInsert('questions', questions);
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM questions
      WHERE roundId IN (
        SELECT id FROM rounds
        WHERE quizId IN (
          SELECT id FROM quizzes WHERE title IN (
            'Global Mix Challenge',
            'Tech & Pop Culture Showdown',
            'Science & Logic Arena',
            'Sports, Movies & Trends',
            'Ultimate Finals Edition'
          ) OR title LIKE '${QUIZ_TITLE_PREFIX}%'
        )
      )
    `);

    await queryInterface.sequelize.query(`
      DELETE FROM rounds
      WHERE quizId IN (
        SELECT id FROM quizzes WHERE title IN (
          'Global Mix Challenge',
          'Tech & Pop Culture Showdown',
          'Science & Logic Arena',
          'Sports, Movies & Trends',
          'Ultimate Finals Edition'
        ) OR title LIKE '${QUIZ_TITLE_PREFIX}%'
      )
    `);

    await queryInterface.sequelize.query(`
      DELETE FROM quizzes
      WHERE title IN (
        'Global Mix Challenge',
        'Tech & Pop Culture Showdown',
        'Science & Logic Arena',
        'Sports, Movies & Trends',
        'Ultimate Finals Edition'
      ) OR title LIKE '${QUIZ_TITLE_PREFIX}%'
    `);
  },
};
