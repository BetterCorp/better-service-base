const assert = require('node:assert');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

module.exports = async ({ pluginRoot }) => {
  const { VaultService } = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/vault.js')).href);
  const { decryptJson } = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/crypto.js')).href);

  const key = Buffer.alloc(32);
  const draftRecords = new Map();
  const audits = [];
  const plugins = [{
    id: 'plugin-1',
    pluginId: 'service-api',
    packageName: '@bsb/service-api',
    version: '1.0.0',
    kind: 'service',
    source: 'manual',
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
    eventSchema: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  }, {
    id: 'plugin-2',
    pluginId: 'service-api',
    packageName: '@bsb/service-api',
    version: '1.1.0',
    kind: 'service',
    source: 'manual',
    configSchema: {
      root: {
        kind: 'object',
        properties: {
          host: { kind: 'string', default: '127.0.0.1' },
          port: { kind: 'int32', min: 1, default: 3300 },
        },
      },
    },
    eventSchema: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  }, {
    id: 'plugin-axiom',
    pluginId: 'observable-axiom',
    packageName: '@bsb/observable-axiom',
    version: '1.0.0',
    kind: 'observable',
    source: 'manual',
    configSchema: {
      root: {
        kind: 'object',
        properties: {
          axiom: {
            kind: 'object',
            properties: {
              token: { kind: 'string', minLength: 1 },
              dataset: { kind: 'string', minLength: 1 },
            },
            required: ['token', 'dataset'],
          },
          serviceName: { kind: 'string', minLength: 1 },
        },
        required: ['axiom', 'serviceName'],
      },
    },
    eventSchema: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  }];
  const store = {
    async countAdmins() { return 1; },
    async listPlugins() {
      return plugins.map((plugin) => ({ ...plugin }));
    },
    async resolveProfileBinding(profileId) {
      return {
        application: { id: 'app-1', name: 'App' },
        group: { id: 'group-1', name: 'api' },
        profile: { id: profileId, name: profileId === 'profile-2' ? 'prod' : 'default' },
      };
    },
    async listProfiles() {
      return [
        { id: 'profile-1', groupId: 'group-1', name: 'default' },
        { id: 'profile-2', groupId: 'group-1', name: 'prod' },
      ];
    },
    async listAllProfiles() {
      return [
        { id: 'profile-1', groupId: 'group-1', name: 'default', activeVersionId: null },
        { id: 'profile-2', groupId: 'group-1', name: 'prod', activeVersionId: null },
      ];
    },
    async listAllApplicationProfiles() { return []; },
    async createPlugin(record) { plugins.push(record); },
    async getDraft(profileId) { return draftRecords.get(profileId) ?? null; },
    async upsertDraft(record) { draftRecords.set(record.profileId, record); },
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

  const saved = decryptJson(draftRecords.get('profile-1'), key);
  assert.deepEqual(saved.default.services.api.config, {
    host: '0.0.0.0',
    port: 3210,
    enabled: false,
    mode: 'prod',
  });
  const synced = decryptJson(draftRecords.get('profile-2'), key);
  assert.deepEqual(synced.prod.services.api, {
    plugin: 'service-api',
    package: '@bsb/service-api',
    version: '1.0.0',
    enabled: false,
  });
  assert.equal(audits.some((audit) => audit.action === 'config.plugin.upsert'), true);
  assert.equal(audits.some((audit) => audit.action === 'config.plugin.sync'), true);

  await vault.upsertProfilePlugin('user-1', {
    profileId: 'profile-1',
    section: 'services',
    name: 'inherited',
    plugin: 'service-api',
    packageName: '@bsb/service-api',
    version: '1.0.0',
    config: { host: 'shared-host', port: '3211', enabled: 'true', mode: 'prod' },
    baseEnabled: true,
    baseConfig: { host: 'shared-host', port: 3200, enabled: true, mode: 'dev' },
    overridePaths: ['port'],
  });
  const inheritedOverride = decryptJson(draftRecords.get('profile-1'), key);
  assert.deepEqual(inheritedOverride.default.services.inherited, {
    plugin: 'service-api',
    package: '@bsb/service-api',
    version: '1.0.0',
    config: { port: 3211 },
  });

  await vault.upsertProfilePlugin('user-1', {
    profileId: 'profile-1',
    section: 'observable',
    name: 'axiom',
    plugin: 'observable-axiom',
    packageName: '@bsb/observable-axiom',
    version: '1.0.0',
    config: { serviceName: 'api-service' },
    baseEnabled: true,
    baseConfig: { axiom: { token: 'shared-token', dataset: 'logs' }, serviceName: 'shared' },
    overridePaths: ['serviceName'],
  });
  const axiomOverride = decryptJson(draftRecords.get('profile-1'), key);
  assert.deepEqual(axiomOverride.default.observable.axiom, {
    plugin: 'observable-axiom',
    package: '@bsb/observable-axiom',
    version: '1.0.0',
    config: { serviceName: 'api-service' },
  });

  await vault.upsertProfilePlugin('user-1', {
    profileId: 'profile-1',
    section: 'services',
    name: 'latest-api',
    plugin: 'service-api',
    packageName: '@bsb/service-api',
    enabled: true,
    config: { port: '3301' },
  });
  const latest = decryptJson(draftRecords.get('profile-1'), key);
  assert.equal(latest.default.services['latest-api'].version, undefined);
  assert.equal(latest.default.services['latest-api'].config.port, 3301);

  await vault.createPlugin('user-1', {
    org: 'bsb',
    name: 'Service API',
    pluginId: 'service-api',
    packageName: '@bsb/service-api',
    version: '2.0.0',
    kind: 'service',
    source: 'manual',
    configSchema: {
      root: {
        kind: 'object',
        properties: {
          url: { kind: 'string', minLength: 1 },
        },
        required: ['url'],
      },
    },
    eventSchema: null,
  });
  const lockedAfterImport = decryptJson(draftRecords.get('profile-1'), key);
  assert.equal(lockedAfterImport.default.services['latest-api'].version, '1.1.0');

  await assert.rejects(() => vault.upsertProfilePlugin('user-1', {
    profileId: 'profile-1',
    section: 'services',
    name: '',
    plugin: 'service-api',
    packageName: '@bsb/service-api',
    enabled: true,
    config: {},
  }), /Config name is required/i);

  await assert.rejects(() => vault.upsertProfilePlugin('user-1', {
    profileId: 'profile-1',
    section: 'services',
    name: 'wrong-kind',
    plugin: 'observable-axiom',
    packageName: '@bsb/observable-axiom',
    enabled: true,
    config: {},
  }), /is not imported/i);

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
