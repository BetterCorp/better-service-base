const assert = require('node:assert');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

module.exports = async ({ pluginRoot }) => {
  const vaultMod = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/vault.js')).href);
  const crypto = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/crypto.js')).href);
  const key = crypto.loadMasterKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
  const secret = 'vs_test_secret';
  const encrypted = crypto.encryptJson({
    default: {
      services: {
        api: { plugin: 'service-api', enabled: true },
      },
    },
  }, key);

  const store = {
    async resolveRuntimeBinding(keyId) {
      assert.equal(keyId, 'vk_test');
      return {
        key: {
          id: 'vk_test',
          secretHash: await crypto.hashSecret(secret),
          configPluginId: 'config-vault',
        },
        application: { name: 'App' },
        group: { name: 'api' },
        profile: { id: 'profile-1', name: 'default', activeVersionId: 'version-1' },
      };
    },
    async getVersion(id) {
      assert.equal(id, 'version-1');
      return {
        id,
        profileId: 'profile-1',
        version: 3,
        ...encrypted,
        publishedAt: new Date().toISOString(),
        publishedBy: 'admin',
      };
    },
    async audit() {},
  };

  const vault = new vaultMod.VaultService({
    store,
    masterKey: key,
    setupCode: 'setup',
    publicUrl: 'http://localhost:8080',
  });
  const resolved = await vault.resolveRuntimeConfig('vk_test', secret);

  assert.equal(resolved.application, 'App');
  assert.equal(resolved.group, 'api');
  assert.equal(resolved.profile, 'default');
  assert.equal(resolved.version, 3);
  assert.equal(resolved.config.default.services.api.plugin, 'service-api');
};
