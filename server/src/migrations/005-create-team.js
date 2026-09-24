'use strict';

const { tableExists, indexExists } = require('./lib/schemaGuards');

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'teams'))) {
      await queryInterface.createTable('teams', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        sessionId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'sessions', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        teamName: {
          type: Sequelize.STRING(50),
          allowNull: false,
        },
        score: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        isEliminated: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        isConnected: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        socketId: {
          type: Sequelize.STRING(100),
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

    if (!(await indexExists(queryInterface, 'teams', 'unique_team_per_session'))) {
      await queryInterface.addIndex('teams', ['sessionId', 'teamName'], {
        unique: true,
        name: 'unique_team_per_session',
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('teams');
  },
};
