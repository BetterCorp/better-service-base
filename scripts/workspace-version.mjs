import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function getPluginPackagePaths() {
  const pluginsDir = path.join(repoRoot, 'plugins', 'nodejs');
  return fs.readdirSync(pluginsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(pluginsDir, entry.name, 'package.json'))
    .filter((filePath) => fs.existsSync(filePath));
}

function isSemver(value) {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value);
}

function syncVersions(baseVersion) {
  const updates = [];
  const docsPackagePath = path.join(repoRoot, 'docs', 'package.json');
  const docsPackage = readJson(docsPackagePath);
  if (docsPackage.version !== baseVersion) {
    docsPackage.version = baseVersion;
    writeJson(docsPackagePath, docsPackage);
    updates.push(`docs -> ${baseVersion}`);
  }

  const baseRange = `^${baseVersion}`;
  for (const packagePath of getPluginPackagePaths()) {
    const pkg = readJson(packagePath);
    let changed = false;
    for (const section of ['peerDependencies', 'devDependencies']) {
      if (pkg[section] && pkg[section]['@bsb/base'] && pkg[section]['@bsb/base'] !== baseRange) {
        pkg[section]['@bsb/base'] = baseRange;
        changed = true;
      }
    }
    if (changed) {
      writeJson(packagePath, pkg);
      updates.push(`${pkg.name} -> @bsb/base ${baseRange}`);
    }
  }

  return updates;
}

const mode = process.argv[2];
const argVersion = process.argv[3];
const basePackagePath = path.join(repoRoot, 'nodejs', 'package.json');
const basePackage = readJson(basePackagePath);

if (mode !== 'sync' && mode !== 'set') {
  console.error('Usage: node scripts/workspace-version.mjs <sync|set> [version]');
  process.exit(1);
}

if (mode === 'set') {
  if (!argVersion || !isSemver(argVersion)) {
    console.error('Expected semantic version, e.g. 9.1.6');
    process.exit(1);
  }
  if (basePackage.version !== argVersion) {
    basePackage.version = argVersion;
    writeJson(basePackagePath, basePackage);
  }
}

const resolvedBaseVersion = readJson(basePackagePath).version;
const updates = syncVersions(resolvedBaseVersion);

console.log(`base version: ${resolvedBaseVersion}`);
if (updates.length === 0) {
  console.log('no workspace version updates needed');
} else {
  for (const update of updates) {
    console.log(update);
  }
}
console.log('next: run `npm install` at repo root to refresh single lockfile');
