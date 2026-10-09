'use strict';

const { tableExists, indexExists } = require('./lib/schemaGuards');

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'answers'))) {
      await queryInterface.createTable('answers', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        teamId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'teams', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        questionId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'questions', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        selectedOptionIndex: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        isCorrect: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
        },
        pointsAwarded: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        wagerAmount: {
          type: Sequelize.INTEGER,
          allowNull: true,
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
    }

    if (!(await indexExists(queryInterface, 'answers', 'one_answer_per_team_per_question'))) {
      await queryInterface.addIndex('answers', ['teamId', 'questionId'], {
        unique: true,
        name: 'one_answer_per_team_per_question',
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('answers');
  },
};
