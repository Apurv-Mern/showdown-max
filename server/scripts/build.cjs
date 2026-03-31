const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const src = path.join(root, 'src');

if (fs.existsSync(dist)) {
  fs.rmSync(dist, { recursive: true, force: true });
}

fs.mkdirSync(dist, { recursive: true });

if (!fs.existsSync(src)) {
  throw new Error('server/src not found');
}

fs.cpSync(src, path.join(dist, 'src'), { recursive: true });

console.log('server build complete -> dist/src');
