import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const forbidden = [
  path.join(repoRoot, 'docs', 'package-lock.json'),
  path.join(repoRoot, 'nodejs', 'package-lock.json'),
];

const pluginsDir = path.join(repoRoot, 'plugins', 'nodejs');
for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  forbidden.push(path.join(pluginsDir, entry.name, 'package-lock.json'));
}

const found = forbidden.filter((filePath) => fs.existsSync(filePath));
if (found.length > 0) {
  console.error('workspace lockfiles must not exist:');
  for (const filePath of found) {
    console.error(`- ${path.relative(repoRoot, filePath)}`);
  }
  process.exit(1);
}

console.log('workspace lockfile check passed');
