const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

module.exports = async ({ pluginRoot }) => {
  const load = (file) => import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault', file)).href);
  const { VaultService } = await load('vault.js');
  const { encryptJson, hashSecret } = await load('crypto.js');
  const key = Buffer.alloc(32, 7);
  const plugins = [];
  const publishers = new Map();
  const profiles = [];
  const publisherId = (id, language = 'nodejs') => `${id}:${language}`;
  let runtimeConfig = { default: { services: { api: { plugin: 'service-shared', enabled: true } } } };
  const store = {
    async authenticationAllowed() { return true; },
    async recordAuthenticationFailure() {},
    async clearAuthenticationFailures() {},
    async getUser() { return null; },
    async audit() {},
    async listPlugins() { return [...plugins]; },
    async listAllProfiles() { return profiles; },
    async listAllApplicationProfiles() { return []; },
    async createPrivatePlugin(plugin, publisher) {
      plugins.push(plugin);
      publishers.set(publisherId(publisher.pluginId, publisher.language), publisher);
    },
    async createPluginIfAbsent(plugin) {
      if (plugins.some(item => item.pluginId === plugin.pluginId && item.language === plugin.language && item.version === plugin.version)) return false;
      plugins.push(plugin); return true;
    },
    async getPluginPublisher(id, language) { return publishers.get(publisherId(id, language)) ?? null; },
    async getPluginPublisherByTokenId(id) { return [...publishers.values()].find(item => item.tokenId === id) ?? null; },
    async createDeployment(_group, profile) { profiles.push(profile); },
    async getDraft() { return null; },
    async getVersion() { return { id: 'v1', version: 1, ...encryptJson(runtimeConfig, key) }; },
    async listGroups() { return []; },
    async getApplicationProfile() { return null; },
    async resolveRuntimeBinding() {
      return {
        key: { configPluginId: 'config-vault', secretHash: await hashSecret('runtime-secret') },
        application: { id: 'app', name: 'App' }, group: { name: 'API' },
        profile: { id: 'profile', name: 'default', language: 'csharp', activeVersionId: 'v1' },
      };
    },
  };
  const vault = new VaultService({ store, masterKey: key, setupCode: 'test', publicUrl: 'https://vault.example' });
  const upload = (language, packageName) => ({
    org: 'acme', packageName, manifestFileName: 'service-shared.plugin.json',
    manifest: { id: 'service-shared', name: 'Shared', version: '1.0.0', category: 'service', language },
  });
  for (const [request, manifest, schema] of [
    ['python', 'csharp', undefined], ['python', undefined, 'csharp'],
    [undefined, 'python', 'csharp'], ['python', 'python', 'csharp'],
  ]) {
    await assert.rejects(vault.createPrivatePlugin('admin', {
      ...upload(manifest, 'test-package'), language: request, schema: { language: schema },
    }), /Invalid plugin language metadata/);
  }
  assert.equal(plugins.length, 0, 'conflicting artifacts must not reach the catalog');
  assert.equal(publishers.size, 0, 'conflicting artifacts must not create publisher credentials');
  const node = await vault.createPrivatePlugin('admin', upload('nodejs', '@acme/shared'));
  const csharp = await vault.createPrivatePlugin('admin', {
    ...upload('csharp', 'Acme.Shared'), language: 'dotnet', schema: { language: 'csharp' },
  });
  assert.equal(plugins.length, 2);
  assert.equal(csharp.plugin.language, 'csharp');
  assert.notEqual(node.keyId, csharp.keyId);
  const publication = {
    org: 'acme', name: 'service-shared', language: 'csharp', version: '2.0.0',
    package: { csharp: 'Acme.Shared' }, metadata: { category: 'service' },
    eventSchema: { pluginId: 'service-shared', version: '2.0.0', events: {} },
  };
  await assert.rejects(vault.publishPrivatePlugin(node.secret, publication), /not authorized/);
  assert.equal((await vault.publishPrivatePlugin(csharp.secret, publication)).status, 'published');
  assert.equal((await vault.publishPrivatePlugin(csharp.secret, publication)).status, 'unchanged');
  assert.equal(plugins.filter(item => item.language === 'nodejs').length, 1);
  const resolved = await vault.resolveRuntimeConfig('key', 'runtime-secret');
  assert.equal(resolved.language, 'csharp');
  assert.equal(resolved.config.default.services.api.package, 'Acme.Shared');
  runtimeConfig.default.services.api.package = '@acme/shared';
  await assert.rejects(vault.resolveRuntimeConfig('key', 'runtime-secret'), /not available for csharp/);
  runtimeConfig.default.services.api.enabled = false;
  assert.equal((await vault.resolveRuntimeConfig('key', 'runtime-secret')).config.default.services.api.package, '@acme/shared');
  delete runtimeConfig.default.services.api.package;
  const legacyReference = (await vault.resolveRuntimeConfig('key', 'runtime-secret')).config.default.services.api;
  assert.equal(legacyReference.language, 'nodejs');
  assert.equal(legacyReference.package, '@acme/shared');
  const deployment = await vault.createDeployment('admin', 'app', 'Python', 'python');
  assert.equal(deployment.profile.language, 'python');
  for (const [language, packageName] of [['go', 'example.com/acme/shared'], ['rust', 'acme_shared']]) {
    const native = await vault.createPrivatePlugin('admin', upload(language, packageName));
    const payload = { ...publication, language, package: { [language]: packageName } };
    await assert.rejects(vault.publishPrivatePlugin(csharp.secret, payload), /not authorized/);
    assert.equal((await vault.publishPrivatePlugin(native.secret, payload)).status, 'published');
    assert.equal((await vault.publishPrivatePlugin(native.secret, payload)).status, 'unchanged');
    assert.equal((await vault.createDeployment('admin', 'app', language, language)).profile.language, language);
  }
  for (const source of ['manifest', 'schema', 'request', 'legacy']) {
    const language = source === 'legacy' ? 'nodejs' : 'python';
    const created = await vault.createPrivatePlugin('admin', {
      org: 'acme', language: source === 'request' ? language : undefined,
      manifest: { id: `service-${source}`, category: 'service', version: '1.0.0',
        language: source === 'manifest' ? language : undefined,
        packages: { nodejs: '@acme/demo', python: 'acme-demo' } },
      schema: source === 'schema' ? { language } : undefined,
    });
    assert.equal(created.plugin.language, language);
    assert.equal(created.plugin.packageName, language === 'python' ? 'acme-demo' : '@acme/demo');
  }
};
