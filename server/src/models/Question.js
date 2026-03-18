const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Question = sequelize.define('Question', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    roundId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'rounds', key: 'id' },
    },
    text: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    options: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: 'Array of { text: string, isCorrect: boolean }; 2–6 options',
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    mediaUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    mediaType: {
      type: DataTypes.ENUM('mp3', 'mp4', 'image'),
      allowNull: true,
    },
    timerDuration: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Per-question timer override in seconds; null = use round default',
    },
    order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  }, {
    tableName: 'questions',
    timestamps: true,
  });

  Question.associate = (models) => {
    Question.belongsTo(models.Round, { foreignKey: 'roundId', as: 'round' });
    Question.hasMany(models.Answer, { foreignKey: 'questionId', as: 'answers' });
  };

  return Question;
};
