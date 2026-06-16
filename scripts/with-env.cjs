/**
 * Load root env files then run a command — replaces dotenv-cli for production
 * hosts that install with --omit=dev (dotenv-cli is a root devDependency).
 *
 * Usage (from repo root):
 *   node scripts/with-env.cjs .env.production .env -- npm run build:prod -w client
 *
 * Matches dotenv-cli -e order: first file wins on duplicate keys (dotenv default).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const sep = args.indexOf('--');

if (sep === -1 || sep === args.length - 1) {
  console.error('Usage: node scripts/with-env.cjs <env-file> [...] -- <command> [args...]');
  process.exit(1);
}

const envFiles = args.slice(0, sep);
const command = args.slice(sep + 1);

function loadEnvFile(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    console.warn(`[with-env] skipping missing file: ${relativePath}`);
    return;
  }
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
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  console.log(`[with-env] loaded ${relativePath}`);
}

for (const file of envFiles) {
  loadEnvFile(file);
}

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

console.log(`[with-env] running: ${command.join(' ')}`);

const result = spawnSync(command[0], command.slice(1), {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error('[with-env] failed to start command:', result.error.message);
  process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
