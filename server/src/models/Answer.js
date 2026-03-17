const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Answer = sequelize.define('Answer', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    teamId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'teams', key: 'id' },
    },
    questionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'questions', key: 'id' },
    },
    selectedOptionIndex: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    isCorrect: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    pointsAwarded: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    wagerAmount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Wager amount for wager rounds',
    },
  }, {
    tableName: 'answers',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['teamId', 'questionId'],
        name: 'one_answer_per_team_per_question',
      },
    ],
  });

  Answer.associate = (models) => {
    Answer.belongsTo(models.Team, { foreignKey: 'teamId', as: 'team' });
    Answer.belongsTo(models.Question, { foreignKey: 'questionId', as: 'question' });
  };

  return Answer;
};
