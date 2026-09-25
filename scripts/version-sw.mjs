// Stamps dist/sw.js with a unique build id (hash of dist/index.html) so every
// deploy gets a fresh cache name and installed PWAs pick up updates immediately.
import fs from 'fs';
import crypto from 'crypto';

const swPath = 'dist/sw.js';
const indexPath = 'dist/index.html';

if (!fs.existsSync(swPath) || !fs.existsSync(indexPath)) {
  console.error('version-sw: dist/sw.js or dist/index.html missing — run vite build first.');
  process.exit(1);
}

const html = fs.readFileSync(indexPath, 'utf8');
const buildId = crypto.createHash('sha256').update(html).digest('hex').slice(0, 12);
const sw = fs.readFileSync(swPath, 'utf8').replace('__BUILD_ID__', buildId);
fs.writeFileSync(swPath, sw);
console.log(`version-sw: cache id ${buildId}`);
