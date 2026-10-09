'use strict';

const { columnExists } = require('./lib/schemaGuards');

module.exports = {
  async up(queryInterface, Sequelize) {
    if (await columnExists(queryInterface, 'sessions', 'liveCheckpoint')) return;

    await queryInterface.addColumn('sessions', 'liveCheckpoint', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'Durable live game snapshot for crash/power-loss resume',
    });
  },

  async down(queryInterface) {
    if (!(await columnExists(queryInterface, 'sessions', 'liveCheckpoint'))) return;
    await queryInterface.removeColumn('sessions', 'liveCheckpoint');
  },
};
