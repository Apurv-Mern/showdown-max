const { DataTypes } = require('sequelize');
const { ROUND_TYPES } = require('shared/constants/roundTypes');

module.exports = (sequelize) => {
  const Round = sequelize.define('Round', {
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
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM(...Object.values(ROUND_TYPES)),
      allowNull: false,
    },
    order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    timerDuration: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30,
    },
  }, {
    tableName: 'rounds',
    timestamps: true,
  });

  Round.associate = (models) => {
    Round.belongsTo(models.Quiz, { foreignKey: 'quizId', as: 'quiz' });
    Round.hasMany(models.Question, { foreignKey: 'roundId', as: 'questions' });
  };

  return Round;
};
