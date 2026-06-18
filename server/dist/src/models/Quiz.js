const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Quiz = sequelize.define('Quiz', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  }, {
    tableName: 'quizzes',
    timestamps: true,
  });

  Quiz.associate = (models) => {
    Quiz.hasMany(models.Round, { foreignKey: 'quizId', as: 'rounds' });
    Quiz.hasMany(models.Session, { foreignKey: 'quizId', as: 'sessions' });
  };

  return Quiz;
};
