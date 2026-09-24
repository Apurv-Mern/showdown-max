'use strict';

const { columnExists } = require('./lib/schemaGuards');

/** Per-question timer override used by the live game engine. Additive — existing rows stay NULL. */
module.exports = {
  async up(queryInterface, Sequelize) {
    if (await columnExists(queryInterface, 'questions', 'timerDuration')) return;

    await queryInterface.addColumn('questions', 'timerDuration', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: 'Per-question timer override in seconds; null = use round default',
    });
  },

  async down(queryInterface) {
    if (!(await columnExists(queryInterface, 'questions', 'timerDuration'))) return;
    await queryInterface.removeColumn('questions', 'timerDuration');
  },
};
