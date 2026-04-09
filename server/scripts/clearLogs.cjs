const fs = require('fs');
const path = require('path');

const logsDir = path.resolve(__dirname, '..', 'logs');
const targets = ['combined.log', 'error.log'];

fs.mkdirSync(logsDir, { recursive: true });

for (const target of targets) {
  const filePath = path.join(logsDir, target);
  fs.writeFileSync(filePath, '');
  console.log(`cleared ${filePath}`);
}

console.log('Local logs cleared. Restart the server to begin a fresh debug session.');
