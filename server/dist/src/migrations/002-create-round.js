'use strict';

const { tableExists } = require('./lib/schemaGuards');

module.exports = {
  async up(queryInterface, Sequelize) {
    if (await tableExists(queryInterface, 'rounds')) return;

    await queryInterface.createTable('rounds', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      quizId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'quizzes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      type: {
        type: Sequelize.ENUM(
          'MULTIPLE_CHOICE', 'WAGER', 'MUSIC', 'ELIMINATION',
          'MAJORITY_RULES', 'FINAL_MULTIPLE_CHOICE', 'FINAL_WAGER',
        ),
        allowNull: false,
      },
      order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      timerDuration: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 30,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('rounds');
  },
};
