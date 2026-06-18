'use strict';

const { getAllQuizTitles } = require('./data/questionBank');
const { applyContentToQuizzes } = require('./data/applyQuizContent');

/**
 * Re-apply real question text, options, and media to seeded quizzes.
 * Safe to run on production after renames (009) or if 008 previously skipped quizzes.
 */
module.exports = {
  async up(queryInterface) {
    const titles = getAllQuizTitles();
    const [quizRows] = await queryInterface.sequelize.query(
      `SELECT id FROM quizzes WHERE title IN (${titles.map(() => '?').join(', ')}) ORDER BY id ASC`,
      { replacements: titles },
    );

    if (quizRows.length === 0) return;

    await applyContentToQuizzes(
      queryInterface,
      quizRows.map((row) => row.id),
    );
  },

  async down() {
    // Data enrichment only.
  },
};
