const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '..');
const sourceRoot = fs.existsSync(path.join(packageRoot, '.badge-source'))
  ? path.join(packageRoot, '.badge-source')
  : path.resolve(packageRoot, '..', '..', '..');

const badges = {};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function addBadge(orgId, pluginId, badge) {
  if (typeof pluginId === 'string' && pluginId.length > 0) {
    badges[`${orgId || '_'}/${pluginId}`] = badge;
  }
}

const corePackageJson = path.join(sourceRoot, 'nodejs', 'package.json');
const corePluginDir = path.join(sourceRoot, 'nodejs', 'src', 'plugins');
if (fs.existsSync(corePackageJson) && fs.existsSync(corePluginDir)) {
  const corePackage = readJson(corePackageJson);
  const coreOrgId = corePackage.bsb?.orgId || '_';
  const publishIgnore = new Set(corePackage.bsb?.publishIgnore ?? []);
  for (const entry of fs.readdirSync(corePluginDir, { withFileTypes: true })) {
    if (entry.isDirectory() && !publishIgnore.has(entry.name)) {
      addBadge(coreOrgId, entry.name, 'CORE');
    }
  }
}

const workspacePluginsDir = path.join(sourceRoot, 'plugins', 'nodejs');
if (fs.existsSync(workspacePluginsDir)) {
  for (const entry of fs.readdirSync(workspacePluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestFile = path.join(workspacePluginsDir, entry.name, 'bsb-plugin.json');
    const packageFile = path.join(workspacePluginsDir, entry.name, 'package.json');
    if (!fs.existsSync(manifestFile)) continue;
    const pkg = fs.existsSync(packageFile) ? readJson(packageFile) : {};
    if (pkg.private === true) continue;
    const manifest = readJson(manifestFile);
    const orgId = pkg.bsb?.orgId || '_';
    for (const plugin of manifest.nodejs ?? []) {
      addBadge(orgId, plugin.id, 'OFFICIAL');
    }
  }
}

const sorted = Object.fromEntries(Object.entries(badges).sort(([a], [b]) => a.localeCompare(b)));
const output = `${JSON.stringify(sorted, null, 2)}\n`;

for (const file of [
  path.join(packageRoot, 'BADGES.json'),
  path.join(packageRoot, 'src', 'plugins', 'service-bsb-registry-ui', 'BADGES.json'),
]) {
  fs.writeFileSync(file, output);
  console.log(`Generated ${path.relative(packageRoot, file)} with ${Object.keys(sorted).length} entries`);
}
