const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

module.exports = async ({ pluginRoot }) => {
  const { VaultService } = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/vault.js')).href);
  const key = Buffer.alloc(32, 1);
  const plugins = [];
  const audits = [];
  const profiles = [];
  const drafts = new Map();
  let publisher = null;
  let publisherUpdates = 0;
  const store = {
    async authenticationAllowed() { return true; },
    async recordAuthenticationFailure() {},
    async clearAuthenticationFailures() {},
    async listPlugins() { return [...plugins]; },
    async createPlugin(plugin) { plugins.push(plugin); },
    async createPrivatePlugin(plugin, createdPublisher) {
      plugins.push(plugin);
      publisher = createdPublisher;
    },
    async createPluginIfAbsent(plugin) { plugins.push(plugin); return true; },
    async getPluginPublisher(pluginId) { return publisher?.pluginId === pluginId ? publisher : null; },
    async getPluginPublisherByTokenId(tokenId) { return publisher?.tokenId === tokenId ? publisher : null; },
    async createPluginPublisher(createdPublisher) { publisher = createdPublisher; },
    async updatePluginPublisherIdentity(record) { publisherUpdates += 1; publisher = { ...publisher, ...record }; },
    async deletePlugin(id) {
      const index = plugins.findIndex((plugin) => plugin.id === id);
      if (index < 0) return false;
      plugins.splice(index, 1);
      return false;
    },
    async rotatePluginPublisher(pluginId, tokenId, secretHash, rotatedAt) {
      assert.equal(pluginId, publisher.pluginId);
      publisher = { ...publisher, tokenId, secretHash, rotatedAt };
    },
    async listAllProfiles() { return profiles; },
    async listAllApplicationProfiles() { return []; },
    async resolveProfileBinding(profileId) {
      const profile = profiles.find((item) => item.id === profileId);
      return profile ? { profile, group: { id: profile.groupId, applicationId: 'app-1', name: 'api' }, application: { id: 'app-1', name: 'App', description: '' } } : null;
    },
    async getDraft(profileId) { return drafts.get(profileId) ?? null; },
    async upsertDraft(record) { drafts.set(record.profileId, record); },
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
  await assert.rejects(() => vault.createPrivatePlugin('admin', {
    org: 'example',
    packageName: '@example/private-api',
    schemaFileName: 'service-private-api.plugin.json',
    schema: { id: 'service-private-api', version: '1.0.0', category: 'service' },
  }), /as the manifest file/);
  await assert.rejects(() => vault.createPrivatePlugin('admin', {
    org: 'example',
    packageName: '@example/private-api',
    schemaFileName: 'bsb-plugin.json',
    schema: { nodejs: [{ id: 'service-private-api' }] },
  }), /generated lib\/schemas\/\{plugin-id\}\.json/);
  const created = await vault.createPrivatePlugin('admin', {
    org: '_',
    packageName: '',
    manifestFileName: 'service-private-api.plugin.json',
    manifest: {
      id: 'service-private-api',
      org: 'example',
      name: 'Private API',
      category: 'service',
      version: '1.0.0',
      packages: { nodejs: '@example/private-api' },
      configSchema: { root: { kind: 'object', properties: {} } },
    },
  });

  assert.match(created.secret, /^bv_p_service-private-api_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43}$/);
  assert.equal(publisher.secretHash.includes(created.secret), false);
  assert.equal(plugins[0].pluginId, 'service-private-api');
  assert.equal(plugins[0].name, 'Private API');
  assert.equal(plugins[0].eventSchema.pluginId, 'service-private-api');
  assert.equal(plugins[0].eventSchema.pluginName, 'service-private-api');
  assert.equal(plugins[0].eventSchema.displayName, 'Private API');
  const createdTokenId = publisher.tokenId;
  const createdSecretHash = publisher.secretHash;
  await assert.rejects(() => vault.createPrivatePlugin('admin', {
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
  }), /Plugin service-private-api version 1\.0\.0 already exists/);
  await assert.rejects(() => vault.createPrivatePlugin('admin', {
    org: '_',
    packageName: '',
    manifestFileName: 'service-private-api.plugin.json',
    manifest: {
      id: 'service-private-api',
      org: 'example',
      name: 'Private API',
      category: 'service',
      version: '1.0.1',
      packages: { nodejs: '@example/renamed-private-api' },
      configSchema: { root: { kind: 'object', properties: {} } },
    },
  }), /different identity.*packageName @example\/private-api -> @example\/renamed-private-api/);
  const uploadedVersion = await vault.createPrivatePlugin('admin', {
    org: 'example',
    packageName: '@example/private-api',
    schemaFileName: 'service-private-api.json',
    schema: {
      pluginName: 'Private API',
      pluginType: 'service',
      version: '1.0.1',
      events: {},
      configSchema: { root: { kind: 'object', properties: { host: { kind: 'string' } } } },
    },
  });
  assert.equal(uploadedVersion.plugin.version, '1.0.1');
  assert.equal(uploadedVersion.plugin.source, 'upload');
  assert.equal(uploadedVersion.secret, undefined);
  assert.equal(publisherUpdates, 1);
  assert.equal(publisher.tokenId, createdTokenId);
  assert.equal(publisher.secretHash, createdSecretHash);
  assert.equal(publisher.packageName, '@example/private-api');

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
  assert.equal(published.plugin.eventSchema.pluginName, 'service-private-api');
  assert.equal(published.plugin.eventSchema.displayName, 'Private API');
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

  await vault.createPrivatePlugin('admin', {
    org: '_',
    packageName: '',
    manifestFileName: 'service-replace-api.plugin.json',
    manifest: {
      id: 'service-replace-api',
      org: 'example',
      name: 'Replace API',
      category: 'service',
      version: '1.0.0',
      packages: { nodejs: '@example/replace-api' },
      configSchema: { root: { kind: 'object', properties: { host: { kind: 'string' } } } },
    },
  });
  profiles.push({ id: 'profile-1', groupId: 'group-1', name: 'prod', activeVersionId: null, createdAt: '2026-01-01T00:00:00.000Z' });
  await vault.saveProfileDraft('admin', 'profile-1', {
    services: {
      api: { plugin: 'service-replace-api', package: '@example/replace-api', enabled: true, config: { host: 'api.local' } },
    },
    events: {},
    observable: {},
  });
  const replacement = await vault.createPrivatePlugin('admin', {
    org: '_',
    packageName: '',
    replace: true,
    manifestFileName: 'service-replace-api.plugin.json',
    manifest: {
      id: 'service-replace-api',
      org: 'example',
      name: 'Replace API',
      category: 'service',
      version: '1.0.1',
      packages: { nodejs: '@example/renamed-replace-api' },
      configSchema: { root: { kind: 'object', properties: { host: { kind: 'string' } } } },
    },
  });
  const migrated = await vault.getProfileDraft('profile-1');
  assert.equal(replacement.plugin.packageName, '@example/renamed-replace-api');
  assert.equal(migrated.services.api.package, '@example/renamed-replace-api');
  assert.equal(migrated.services.api.version, '1.0.1');
  assert.equal(migrated.services.api.config.host, 'api.local');
  assert.equal(publisher.packageName, '@example/renamed-replace-api');
  assert.equal(publisherUpdates, 2);

  plugins.push({ ...replacement.plugin, id: 'config-plugin', pluginId: 'config-vault', name: 'config-vault', kind: 'config' });
  const usage = await vault.pluginUsage(plugins);
  const retainedPluginIds = plugins.filter((plugin) => plugin.kind === 'config' || usage[plugin.id]?.count).map((plugin) => plugin.id);
  const unusedCount = plugins.length - retainedPluginIds.length;
  assert.equal(await vault.cleanupUnusedPlugins('admin'), unusedCount);
  assert.deepEqual(plugins.map((plugin) => plugin.id), retainedPluginIds);

  assert.ok(audits.some((entry) => entry.action === 'plugin.publisher.rotate'));
  assert.equal(JSON.stringify(audits).includes(created.secret), false);
};
