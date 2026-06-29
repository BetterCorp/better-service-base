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
        api: { plugin: 'service-api', enabled: true, override: true, config: { serviceName: 'api' } },
        config: { plugin: 'betterportal/service-betterportal-config-manager', version: '10.0.5', enabled: true },
      },
    },
  }, key);
  const sharedEncrypted = crypto.encryptJson({
    default: {
      services: {
        api: { plugin: 'service-api', enabled: true, config: { url: 'https://axiom.example', serviceName: 'shared' } },
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
        application: { id: 'app-1', name: 'App' },
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
    async getApplicationProfile(applicationId, profileName) {
      assert.equal(applicationId, 'app-1');
      assert.equal(profileName, 'default');
      return { id: 'app-profile-1', applicationId, name: profileName, activeVersionId: 'app-version-1' };
    },
    async getApplicationVersion(id) {
      assert.equal(id, 'app-version-1');
      return {
        id,
        applicationProfileId: 'app-profile-1',
        version: 1,
        ...sharedEncrypted,
        publishedAt: new Date().toISOString(),
        publishedBy: 'admin',
      };
    },
    async listPlugins() {
      return [{
        id: 'plugin-1',
        org: 'betterportal',
        name: 'BetterPortal Config Manager',
        pluginId: 'service-betterportal-config-manager',
        packageName: '@betterportal/config-manager',
        version: '10.0.5',
        kind: 'service',
        source: 'registry',
        configSchema: null,
        eventSchema: null,
        createdAt: new Date().toISOString(),
      }];
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
  assert.equal(resolved.config.default.services.api.override, undefined);
  assert.equal(resolved.config.default.services.api.config.url, 'https://axiom.example');
  assert.equal(resolved.config.default.services.api.config.serviceName, 'api');
  assert.equal(resolved.config.default.services.config.plugin, 'service-betterportal-config-manager');
  assert.equal(resolved.config.default.services.config.package, '@betterportal/config-manager');
};
