'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sessions', {
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
      pin: {
        type: Sequelize.STRING(6),
        allowNull: false,
        unique: true,
      },
      hostToken: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      qrCodeData: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      maxTeams: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 50,
      },
      status: {
        type: Sequelize.ENUM('pending', 'active', 'completed'),
        allowNull: false,
        defaultValue: 'pending',
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
    await queryInterface.dropTable('sessions');
  },
};
