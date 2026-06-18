'use strict';

/** Allow question mediaType = image (used by image trivia questions). */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE questions
      MODIFY COLUMN mediaType ENUM('mp3', 'mp4', 'image') NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE questions SET mediaType = NULL WHERE mediaType = 'image'
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE questions
      MODIFY COLUMN mediaType ENUM('mp3', 'mp4') NULL
    `);
  },
};
