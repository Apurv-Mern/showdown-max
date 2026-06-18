const { Sequelize } = require('sequelize');
const { env } = require('../config/env');
const logger = require('../utils/logger');

const sequelize = new Sequelize(env.DB_NAME, env.DB_USER, env.DB_PASSWORD, {
  host: env.DB_HOST,
  port: env.DB_PORT,
  dialect: 'mysql',
  logging: false,
  pool: {
    max: env.NODE_ENV === 'production' ? 50 : 20,
    min: 5,
    acquire: 30000,
    idle: 10000,
  },
});

const Quiz = require('./Quiz')(sequelize);
const Round = require('./Round')(sequelize);
const Question = require('./Question')(sequelize);
const Session = require('./Session')(sequelize);
const Team = require('./Team')(sequelize);
const Answer = require('./Answer')(sequelize);
const HostAccount = require('./HostAccount')(sequelize);

const models = { Quiz, Round, Question, Session, Team, Answer, HostAccount };

Object.values(models).forEach((model) => {
  if (model.associate) {
    model.associate(models);
  }
});

const testConnection = async () => {
  try {
    await sequelize.authenticate();
    logger.info('MySQL connected', {
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_USER,
    });
  } catch (err) {
    logger.error('MySQL connection failed', { error: err.message });
  }
};

const syncDatabase = async (options = {}) => {
  try {
    await sequelize.sync(options);
    logger.info('Database synced');
  } catch (err) {
    logger.error('Database sync failed', { error: err.message });
  }
};

module.exports = {
  sequelize,
  ...models,
  testConnection,
  syncDatabase,
};
