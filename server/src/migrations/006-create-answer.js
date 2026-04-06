'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const allTables = await queryInterface.showAllTables();
    const tableNames = allTables.map((t) => {
      if (typeof t === 'string') return t;
      if (t && typeof t === 'object') return t.tableName || t.TABLE_NAME || '';
      return '';
    });

    if (!tableNames.includes('answers')) {
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

    const indexes = await queryInterface.showIndex('answers');
    const hasAnswerUniqueIndex = indexes.some((idx) => idx.name === 'one_answer_per_team_per_question');
    if (!hasAnswerUniqueIndex) {
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
