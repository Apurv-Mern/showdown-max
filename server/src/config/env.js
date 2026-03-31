const { z } = require('zod');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const envSchema = z.object({
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(3306),
  DB_NAME: z.string().default('showdown_trivia'),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  PORT: z.coerce.number().default(3002),
  UPLOAD_DIR: z.string().default('./uploads'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().min(16).default('dev_jwt_secret_change_in_production'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  ADMIN_EMAIL: z.string().email().default('admin@showdown.com'),
  ADMIN_PASSWORD: z.string().min(4).default('admin123'),
  HOST_EMAIL: z.string().email().default('host@showdown.com'),
  HOST_PASSWORD: z.string().min(4).default('host123'),
});

const env = envSchema.parse(process.env);

module.exports = { env };
