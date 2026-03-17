'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('questions', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      roundId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'rounds', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      text: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      options: {
        type: Sequelize.JSON,
        allowNull: false,
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      mediaUrl: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      mediaType: {
        type: Sequelize.ENUM('mp3', 'mp4'),
        allowNull: true,
      },
      order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
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
    await queryInterface.dropTable('questions');
  },
};
