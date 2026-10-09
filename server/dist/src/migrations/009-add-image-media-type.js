'use strict';

const { tableExists } = require('./lib/schemaGuards');

/** Allow question mediaType = image (used by image trivia questions). Safe to re-run. */
module.exports = {
  async up(queryInterface) {
    if (!(await tableExists(queryInterface, 'questions'))) return;

    await queryInterface.sequelize.query(`
      ALTER TABLE questions
      MODIFY COLUMN mediaType ENUM('mp3', 'mp4', 'image') NULL
    `);
  },

  async down(queryInterface) {
    if (!(await tableExists(queryInterface, 'questions'))) return;

    await queryInterface.sequelize.query(`
      UPDATE questions SET mediaType = NULL WHERE mediaType = 'image'
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE questions
      MODIFY COLUMN mediaType ENUM('mp3', 'mp4') NULL
    `);
  },
};
