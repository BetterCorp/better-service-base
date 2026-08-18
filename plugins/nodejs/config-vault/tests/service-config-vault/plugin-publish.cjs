const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

module.exports = async ({ pluginRoot }) => {
  const { VaultService } = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/vault.js')).href);
  const key = Buffer.alloc(32, 1);
  const plugins = [];
  const audits = [];
  let publisher = null;
  const store = {
    async authenticationAllowed() { return true; },
    async recordAuthenticationFailure() {},
    async clearAuthenticationFailures() {},
    async listPlugins() { return plugins; },
    async createPlugin(plugin) { plugins.push(plugin); },
    async createPrivatePlugin(plugin, createdPublisher) {
      plugins.push(plugin);
      publisher = createdPublisher;
    },
    async createPluginIfAbsent(plugin) { plugins.push(plugin); return true; },
    async getPluginPublisher(pluginId) { return publisher?.pluginId === pluginId ? publisher : null; },
    async getPluginPublisherByTokenId(tokenId) { return publisher?.tokenId === tokenId ? publisher : null; },
    async createPluginPublisher(createdPublisher) { publisher = createdPublisher; },
    async rotatePluginPublisher(pluginId, tokenId, secretHash, rotatedAt) {
      assert.equal(pluginId, publisher.pluginId);
      publisher = { ...publisher, tokenId, secretHash, rotatedAt };
    },
    async listAllProfiles() { return []; },
    async listAllApplicationProfiles() { return []; },
    async getUser() { return null; },
    async audit(entry) { audits.push(entry); },
  };
  const vault = new VaultService({ store, masterKey: key, setupCode: 'setup', publicUrl: 'http://localhost:8080' });
  await assert.rejects(() => vault.createPlugin('admin', {
    org: 'example', name: 'Unsafe', pluginId: 'unsafe', packageName: '@example/unsafe', version: '1.0.0',
    kind: 'service', source: 'manual',
    configSchema: { root: { kind: 'string', pattern: '(a+)+$' } }, eventSchema: null,
  }), /unsafe regular expression/i);
  await assert.rejects(() => vault.createPlugin('admin', {
    org: 'example', name: 'Polluting', pluginId: 'polluting', packageName: '@example/polluting', version: '1.0.0',
    kind: 'service', source: 'manual', configSchema: JSON.parse('{"root":{"kind":"object","__proto__":{}}}'), eventSchema: null,
  }), /forbidden key/i);
  const created = await vault.createPrivatePlugin('admin', {
    org: 'example',
    packageName: '@example/private-api',
    schemaFileName: 'service-private-api.json',
    schema: {
      pluginName: 'Private API',
      pluginType: 'service',
      version: '1.0.0',
      events: {},
      configSchema: { root: { kind: 'object', properties: {} } },
    },
  });

  assert.match(created.secret, /^bv_p_service-private-api_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43}$/);
  assert.equal(publisher.secretHash.includes(created.secret), false);
  assert.equal(plugins[0].pluginId, 'service-private-api');

  const request = {
    org: 'example',
    name: 'service-private-api',
    version: '1.1.0',
    language: 'nodejs',
    metadata: { category: 'service' },
    package: { nodejs: '@example/private-api' },
    eventSchema: { pluginName: 'Private API', version: '1.1.0', events: {} },
    configSchema: { root: { kind: 'object', properties: { port: { kind: 'int32' } } } },
  };
  const published = await vault.publishPrivatePlugin(created.secret, request);
  assert.equal(published.status, 'published');
  assert.equal(published.plugin.source, 'upload');
  assert.equal((await vault.publishPrivatePlugin(created.secret, request)).status, 'unchanged');

  await assert.rejects(
    () => vault.publishPrivatePlugin(created.secret, { ...request, configSchema: { changed: true } }),
    /cannot be overwritten/,
  );
  await assert.rejects(
    () => vault.publishPrivatePlugin(created.secret, { ...request, name: 'service-other', version: '1.2.0', eventSchema: { version: '1.2.0', events: {} } }),
    /not authorized/,
  );

  const rotated = await vault.rotatePluginPublisher('admin', 'service-private-api');
  await assert.rejects(() => vault.publishPrivatePlugin(created.secret, { ...request, version: '1.2.0' }), /Invalid plugin publish token/);
  assert.equal((await vault.publishPrivatePlugin(rotated.secret, {
    ...request,
    version: '1.2.0',
    eventSchema: { pluginName: 'Private API', version: '1.2.0', events: {} },
  })).status, 'published');
  assert.ok(audits.some((entry) => entry.action === 'plugin.publisher.rotate'));
  assert.equal(JSON.stringify(audits).includes(created.secret), false);
};
