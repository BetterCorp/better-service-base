const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

module.exports = async ({ pluginRoot }) => {
  const load = name => import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault', name)).href);
  const { VaultService } = await load('vault.js');
  const { encryptJson } = await load('crypto.js');
  const key = Buffer.alloc(32, 4);
  const plugins = ['nodejs', 'go', 'rust', 'python', 'csharp'].map(language => ({
    id: language, language, pluginId: 'service-api', org: 'acme', kind: 'service',
    version: '1.0.0', source: 'registry', createdAt: '2020-01-01T00:00:00Z',
  }));
  delete plugins[0].language; // Legacy catalog records also default to Node.js.
  const entry = { plugin: 'service-api', enabled: false };
  const encrypted = () => encryptJson({ default: { services: { api: entry } } }, key);
  const store = {
    async listPlugins() { return [...plugins]; },
    async listAllProfiles() { return [{ id: 'native', name: 'default', language: 'rust', activeVersionId: 'live' }]; },
    async listAllApplicationProfiles() { return [{ id: 'shared', name: 'default', applicationId: 'app', activeVersionId: 'shared-live' }]; },
    async resolveProfileBinding() { return { profile: { name: 'default' } }; },
    async getApplicationProfileById() { return { name: 'default' }; },
    async getDraft() { return encrypted(); },
    async getVersion() { return encrypted(); },
    async getApplicationDraft() { return encrypted(); },
    async getApplicationVersion() { return encrypted(); },
    async deletePlugin(id) { plugins.splice(plugins.findIndex(plugin => plugin.id === id), 1); return false; },
    async getUser() { return null; },
    async audit() {},
  };
  const vault = new VaultService({ store, masterKey: key, setupCode: 'test', publicUrl: 'https://vault.example' });
  let usage = await vault.pluginUsage(plugins);
  assert.deepEqual(Object.keys(usage), ['nodejs']);
  assert.equal(usage.nodejs.count, 4, 'deployment and shared drafts/live versions retain only the legacy language');

  entry.language = 'go';
  usage = await vault.pluginUsage(plugins);
  assert.deepEqual(Object.keys(usage), ['go']);
  assert.equal(usage.go.count, 4, 'explicit disabled remote references retain their own language');

  delete entry.language;
  entry.enabled = true;
  usage = await vault.pluginUsage(plugins);
  assert.equal(usage.rust.count, 4, 'enabled deployment entries use the deployment language');
  assert.equal(usage.nodejs.count, 2, 'unannotated enabled shared entries may target each deployment language');

  entry.enabled = false;
  await assert.rejects(vault.deletePlugin('admin', 'nodejs'), /used by 4 config entries/);
  await vault.deletePlugin('admin', 'go');
  assert.equal(await vault.cleanupUnusedImportedPlugins('admin'), 3);
  assert.deepEqual(plugins.map(plugin => plugin.id), ['nodejs']);
  plugins.push({ ...plugins[0], id: 'rust', language: 'rust' });
  assert.equal(await vault.cleanupUnusedPlugins('admin'), 1);
  assert.deepEqual(plugins.map(plugin => plugin.id), ['nodejs']);
};
