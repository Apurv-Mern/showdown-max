'use strict';

const { ROUND_ONE_ORDERING_QUESTION } = require('./data/questionBank');
const { ensureSeedMediaUrls } = require('./data/seedMedia');

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const mediaUrls = await ensureSeedMediaUrls();
    const orderingMedia = mediaUrls.imageHistory;

    const [finalWagerRounds] = await queryInterface.sequelize.query(
      "SELECT id FROM rounds WHERE type = 'FINAL_WAGER'",
    );

    for (const round of finalWagerRounds) {
      await queryInterface.sequelize.query(
        'DELETE FROM questions WHERE roundId = :roundId AND `order` > 0',
        { replacements: { roundId: round.id } },
      );
    }

    const [roundOneRows] = await queryInterface.sequelize.query(
      "SELECT id FROM rounds WHERE type = 'MULTIPLE_CHOICE' AND `order` = 0",
    );

    for (const round of roundOneRows) {
      const [questionRows] = await queryInterface.sequelize.query(
        'SELECT id, `order` FROM questions WHERE roundId = :roundId ORDER BY `order` ASC',
        { replacements: { roundId: round.id } },
      );

      if (questionRows.length === 0) continue;

      const lastQuestion = questionRows[questionRows.length - 1];
      await queryInterface.bulkUpdate(
        'questions',
        {
          text: ROUND_ONE_ORDERING_QUESTION.text,
          options: JSON.stringify(ROUND_ONE_ORDERING_QUESTION.options),
          category: ROUND_ONE_ORDERING_QUESTION.category,
          mediaUrl: orderingMedia?.mediaUrl ?? null,
          mediaType: orderingMedia?.mediaType ?? null,
          updatedAt: now,
        },
        { id: lastQuestion.id },
      );
    }
  },

  async down() {
    // Data fix only.
  },
};
