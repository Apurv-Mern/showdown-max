const path = require('path');
const fs = require('fs');

function parseEnvFile(filePath) {
  /** @type {Record<string, string>} */
  const parsed = {};
  if (!fs.existsSync(filePath)) return parsed;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

const root = __dirname;
const baseEnv = parseEnvFile(path.join(root, '.env'));
const prodEnv = parseEnvFile(path.join(root, '.env.production'));
const serverEnv = {
  NODE_ENV: 'production',
  PORT: 5001,
  NODE_OPTIONS: '--max-old-space-size=512',
  ...baseEnv,
  ...prodEnv,
};

module.exports = {
  apps: [
    {
      name: 'showdown-server',
      cwd: './server',
      script: 'dist/src/index.js',
      node_args: '--max-old-space-size=512',
      env: serverEnv,
      max_memory_restart: '600M',
      watch: false,
      autorestart: true,
    },
    {
      name: 'showdown-client',
      cwd: './client',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 5003',
      node_args: '--max-old-space-size=768',
      env: {
        NODE_ENV: 'production',
        PORT: 5003,
        NODE_OPTIONS: '--max-old-space-size=768',
        ...baseEnv,
        ...prodEnv,
      },
      max_memory_restart: '900M',
      watch: false,
      autorestart: true,
    },
  ],
};
