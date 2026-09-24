'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const serverRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverRoot, '..');
const target = String(process.argv[2] || 'development').toLowerCase();

const envFiles = {
  development: [path.join(repoRoot, '.env'), path.join(repoRoot, '.env.development')],
  staging: [path.join(repoRoot, '.env'), path.join(repoRoot, '.env.staging')],
  production: [path.join(repoRoot, '.env'), path.join(repoRoot, '.env.production')],
};

if (!envFiles[target]) {
  console.error(`Unknown migrate target "${target}". Use development, staging, or production.`);
  process.exit(1);
}

for (const filePath of envFiles[target]) {
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override: true });
  }
}

if (target === 'staging' && process.env.DB_HOST === 'localhost') {
  console.error(
    'Staging migrate refused: DB_HOST is still localhost. Put the staging DB vars in repo-root .env.staging',
  );
  process.exit(1);
}

process.env.NODE_ENV = process.env.NODE_ENV || (target === 'production' ? 'production' : 'development');

console.log('Running sequelize migrate', {
  target,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
});

const result = spawnSync('npx', ['sequelize-cli', 'db:migrate'], {
  cwd: serverRoot,
  env: process.env,
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 1);
