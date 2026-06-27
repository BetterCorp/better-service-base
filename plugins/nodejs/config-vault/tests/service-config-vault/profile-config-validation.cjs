const assert = require('node:assert');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

module.exports = async ({ pluginRoot }) => {
  const { VaultService } = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/vault.js')).href);
  const { decryptJson } = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/crypto.js')).href);

  const key = Buffer.alloc(32);
  let draftRecord = null;
  const audits = [];
  const store = {
    async countAdmins() { return 1; },
    async listPlugins() {
      return [{
        id: 'plugin-1',
        pluginId: 'service-api',
        packageName: '@bsb/service-api',
        version: '1.0.0',
        kind: 'service',
        configSchema: {
          root: {
            kind: 'object',
            properties: {
              host: { kind: 'string', default: '0.0.0.0' },
              port: { kind: 'int32', min: 1, default: 3200 },
              enabled: { kind: 'bool', default: true },
              mode: { kind: 'enum', values: ['dev', 'prod'], default: 'dev' },
            },
          },
        },
      }];
    },
    async resolveProfileBinding() {
      return {
        application: { id: 'app-1', name: 'App' },
        group: { id: 'group-1', name: 'api' },
        profile: { id: 'profile-1', name: 'default' },
      };
    },
    async getDraft() { return draftRecord; },
    async upsertDraft(record) { draftRecord = record; },
    async audit(record) { audits.push(record); },
  };

  const vault = new VaultService({
    store,
    masterKey: key,
    setupCode: 'setup',
    publicUrl: 'http://localhost:8080',
  });

  await vault.upsertProfilePlugin('user-1', {
    profileId: 'profile-1',
    section: 'services',
    name: 'api',
    plugin: 'service-api',
    packageName: '@bsb/service-api',
    version: '1.0.0',
    enabled: true,
    config: { port: '3210', enabled: 'false', mode: 'prod', ignored: 'strip-me' },
  });

  const saved = decryptJson(draftRecord, key);
  assert.deepEqual(saved.default.services.api.config, {
    host: '0.0.0.0',
    port: 3210,
    enabled: false,
    mode: 'prod',
  });
  assert.equal(audits.some((audit) => audit.action === 'config.plugin.upsert'), true);

  await assert.rejects(() => vault.upsertProfilePlugin('user-1', {
    profileId: 'profile-1',
    section: 'services',
    name: 'api',
    plugin: 'service-api',
    packageName: '@bsb/service-api',
    version: '1.0.0',
    enabled: true,
    config: { port: 'not-a-number' },
  }), /config\.port must be a number/i);
};
