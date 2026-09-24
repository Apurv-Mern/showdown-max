const { z } = require('zod');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const resolveRepoRoot = () => {
  const candidates = [
    path.resolve(__dirname, '../../../../'),
    path.resolve(__dirname, '../../../'),
    path.resolve(process.cwd(), '..'),
    path.resolve(process.cwd()),
  ];

  return (
    candidates.find(
      (dir) => fs.existsSync(path.join(dir, '.env')) || fs.existsSync(path.join(dir, '.env.example')),
    ) || candidates[0]
  );
};

const loadProjectEnv = () => {
  // CLI / process env must win. `.env.development` used to override those and
  // sent sequelize-cli at root@localhost even when staging vars were exported.
  const preset = { ...process.env };
  const root = resolveRepoRoot();
  const mode = process.env.NODE_ENV || 'development';

  const basePath = path.join(root, '.env');
  if (fs.existsSync(basePath)) {
    dotenv.config({ path: basePath });
  }

  const modeFile =
    mode === 'production'
      ? path.join(root, '.env.production')
      : mode === 'development'
        ? path.join(root, '.env.development')
        : null;

  if (modeFile && fs.existsSync(modeFile)) {
    dotenv.config({ path: modeFile, override: true });
  }

  const stagingPath = path.join(root, '.env.staging');
  if (String(process.env.DB_TARGET || '').toLowerCase() === 'staging' && fs.existsSync(stagingPath)) {
    dotenv.config({ path: stagingPath, override: true });
  }

  for (const [key, value] of Object.entries(preset)) {
    if (value !== undefined) process.env[key] = value;
  }
};

loadProjectEnv();

const envSchema = z.object({
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(3306),
  DB_NAME: z.string().default('showdown_trivia'),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  PORT: z.coerce.number().default(5001),
  UPLOAD_DIR: z.string().default('./uploads'),
  STORAGE_BACKEND: z.enum(['local', 's3']).optional(),
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_KEY_PREFIX: z.string().default('media/'),
  S3_PUBLIC_BASE_URL: z.string().optional(),
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
  // Comma-separated list of allowed CORS origins. Leave unset to use
  // sensible per-NODE_ENV defaults in `server/src/config/cors.js`.
  ALLOWED_ORIGINS: z.string().optional(),
  // Public frontend URL for QR codes / join links.
  CLIENT_PUBLIC_URL: z.string().url().optional(),
});

const hasS3Config = (source) =>
  Boolean(
    source.S3_BUCKET &&
      source.AWS_ACCESS_KEY_ID &&
      source.AWS_SECRET_ACCESS_KEY &&
      source.S3_PUBLIC_BASE_URL &&
      source.AWS_REGION,
  );

const resolveStorageBackend = (parsed) => {
  if (parsed.STORAGE_BACKEND === 'local' || parsed.STORAGE_BACKEND === 's3') {
    return parsed.STORAGE_BACKEND;
  }
  if (parsed.NODE_ENV === 'production' && hasS3Config(parsed)) {
    return 's3';
  }
  if (hasS3Config(parsed)) {
    return 's3';
  }
  return 'local';
};

const parsedEnv = envSchema.parse(process.env);
const env = {
  ...parsedEnv,
  STORAGE_BACKEND: resolveStorageBackend(parsedEnv),
};

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

  if (env.STORAGE_BACKEND === 's3') {
    const missingS3Vars = [
      'AWS_REGION',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'S3_BUCKET',
      'S3_PUBLIC_BASE_URL',
    ].filter((key) => !process.env[key] || String(process.env[key]).trim() === '');

    if (missingS3Vars.length > 0) {
      throw new Error(`Missing required S3 env vars: ${missingS3Vars.join(', ')}`);
    }
  }
}

module.exports = { env };
