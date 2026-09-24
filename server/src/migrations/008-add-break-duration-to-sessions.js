'use strict';

const { columnExists } = require('./lib/schemaGuards');

module.exports = {
  async up(queryInterface, Sequelize) {
    if (await columnExists(queryInterface, 'sessions', 'breakDuration')) return;

    await queryInterface.addColumn('sessions', 'breakDuration', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 360,
      comment: 'Break duration in seconds (admin-configurable per session)',
    });
  },

  async down(queryInterface) {
    if (!(await columnExists(queryInterface, 'sessions', 'breakDuration'))) return;
    await queryInterface.removeColumn('sessions', 'breakDuration');
  },
};
