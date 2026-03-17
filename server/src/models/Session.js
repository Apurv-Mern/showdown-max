const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Session = sequelize.define('Session', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    quizId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'quizzes', key: 'id' },
    },
    pin: {
      type: DataTypes.STRING(6),
      allowNull: false,
      unique: true,
    },
    hostToken: {
      type: DataTypes.STRING(64),
      allowNull: false,
      comment: 'Token for host auth during live session',
    },
    qrCodeData: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Base64 QR code data URL',
    },
    maxTeams: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 50,
    },
    status: {
      type: DataTypes.ENUM('pending', 'active', 'completed'),
      allowNull: false,
      defaultValue: 'pending',
    },
  }, {
    tableName: 'sessions',
    timestamps: true,
  });

  Session.associate = (models) => {
    Session.belongsTo(models.Quiz, { foreignKey: 'quizId', as: 'quiz' });
    Session.hasMany(models.Team, { foreignKey: 'sessionId', as: 'teams' });
  };

  return Session;
};
