const { z } = require('zod');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const resolveEnvPath = () => {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../../../../.env'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
};

const envPath = resolveEnvPath();
if (envPath) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const envSchema = z.object({
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(3306),
  DB_NAME: z.string().default('showdown_trivia'),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  PORT: z.coerce.number().default(5001),
  UPLOAD_DIR: z.string().default('./uploads'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().min(16).default('dev_jwt_secret_change_in_production'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  ADMIN_EMAIL: z.string().email().default('admin@showdown.com'),
  ADMIN_PASSWORD: z.string().min(4).default('admin123'),
  HOST_EMAIL: z.string().email().default('host@showdown.com'),
  HOST_PASSWORD: z.string().min(4).default('host123'),
  DB_SYNC_ALTER: z
    .string()
    .optional()
    .transform((value) => String(value).toLowerCase() === 'true'),
});

const env = envSchema.parse(process.env);

if (env.NODE_ENV === 'production') {
  const missingProductionVars = [
    'DB_HOST',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'JWT_SECRET',
  ].filter((key) => !process.env[key] || String(process.env[key]).trim() === '');

  if (missingProductionVars.length > 0) {
    throw new Error(`Missing required production env vars: ${missingProductionVars.join(', ')}`);
  }
}

module.exports = { env };
