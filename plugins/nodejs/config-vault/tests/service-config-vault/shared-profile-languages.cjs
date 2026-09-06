const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

module.exports = async ({ pluginRoot }) => {
  const load = name => import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault', name)).href);
  const { VaultService } = await load('vault.js');
  const { encryptJson } = await load('crypto.js');
  const key = Buffer.alloc(32, 3);
  const profiles = [{ id: 'native', name: 'default', language: 'python', activeVersionId: 'native-v1' },
    { id: 'node', name: 'default', language: 'nodejs', activeVersionId: 'node-v1' }];
  let shared = { services: { api: { plugin: 'service-api', language: 'nodejs', enabled: true } } };
  let native = { services: {} };
  let publications = 0;
  const store = {
    async getUser() { return null; }, async audit() {},
    async getApplicationDraft() { return encryptJson({ default: shared }, key); },
    async getApplicationProfileById() { return { applicationId: 'app', name: 'default' }; },
    async listAllProfiles() { return profiles; },
    async resolveProfileBinding(id) { return { application: { id: 'app' }, profile: profiles.find(profile => profile.id === id) }; },
    async getVersion(id) { return { id, ...encryptJson({ default: id === 'native-v1' ? native : {} }, key) }; },
    async listPlugins() { return ['nodejs', 'python'].map(language => ({ pluginId: 'service-api', org: 'acme', kind: 'service', language, version: '1.0.0', packageName: language + '-api' })); },
    async createApplicationVersion() { publications++; return publications; },
  };
  const vault = new VaultService({ store, masterKey: key, setupCode: 'test', publicUrl: 'https://vault.example' });
  await assert.rejects(vault.publishApplicationProfileDraft('admin', 'shared'), /requires nodejs.*python/);
  assert.equal(publications, 0);
  native = { services: { api: { plugin: 'service-api', language: 'python', enabled: true } } };
  assert.equal((await vault.publishApplicationProfileDraft('admin', 'shared')).version, 1);
  native = { services: { api: { enabled: false, override: true } } };
  assert.equal((await vault.publishApplicationProfileDraft('admin', 'shared')).version, 2);
  shared = { services: { custom: { plugin: 'service-not-in-catalog', language: 'nodejs', enabled: true } } };
  await assert.rejects(vault.publishApplicationProfileDraft('admin', 'shared'), /requires nodejs.*python/);
  assert.equal(publications, 2);
};
