const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

const copyTargets = ['index.js', 'constants', 'schemas', 'types'];

if (fs.existsSync(dist)) {
  fs.rmSync(dist, { recursive: true, force: true });
}

fs.mkdirSync(dist, { recursive: true });

for (const target of copyTargets) {
  const sourcePath = path.join(root, target);
  const destinationPath = path.join(dist, target);

  if (!fs.existsSync(sourcePath)) {
    continue;
  }

  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    fs.cpSync(sourcePath, destinationPath, { recursive: true });
  } else {
    fs.copyFileSync(sourcePath, destinationPath);
  }
}

console.log('shared build complete -> dist');
