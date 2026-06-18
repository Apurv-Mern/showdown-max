'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('sessions', 'breakDuration', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 360,
      comment: 'Break duration in seconds (admin-configurable per session)',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('sessions', 'breakDuration');
  },
};
