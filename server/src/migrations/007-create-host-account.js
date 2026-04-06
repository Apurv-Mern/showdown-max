'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('host_accounts', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      passwordHash: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      sessionId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        unique: true,
        references: { model: 'sessions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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
    await queryInterface.dropTable('host_accounts');
  },
};
