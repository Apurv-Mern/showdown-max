const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Team = sequelize.define('Team', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    sessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'sessions', key: 'id' },
    },
    teamName: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isEliminated: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    isConnected: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    socketId: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
  }, {
    tableName: 'teams',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['sessionId', 'teamName'],
        name: 'unique_team_per_session',
      },
    ],
  });

  Team.associate = (models) => {
    Team.belongsTo(models.Session, { foreignKey: 'sessionId', as: 'session' });
    Team.hasMany(models.Answer, { foreignKey: 'teamId', as: 'answers' });
  };

  return Team;
};
