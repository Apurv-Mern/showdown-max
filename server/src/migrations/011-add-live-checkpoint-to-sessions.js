'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('sessions', 'liveCheckpoint', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'Durable live game snapshot for crash/power-loss resume',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('sessions', 'liveCheckpoint');
  },
};
