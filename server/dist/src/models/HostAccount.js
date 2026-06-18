const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const HostAccount = sequelize.define('HostAccount', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    passwordHash: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    sessionId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      unique: true,
      references: { model: 'sessions', key: 'id' },
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  }, {
    tableName: 'host_accounts',
    timestamps: true,
  });

  HostAccount.associate = (models) => {
    HostAccount.belongsTo(models.Session, { foreignKey: 'sessionId', as: 'assignedSession' });
  };

  return HostAccount;
};
