const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

module.exports = async ({ pluginRoot }) => {
  const { VaultStore } = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/store.js')).href);
  const calls = [];
  const store = Object.create(VaultStore.prototype);
  const query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('from vault_profiles p')) return { rows: [{ application_id: 'new-app', group_id: 'new-group' }] };
    if (sql.includes('select profile_id from vault_runtime_keys')) return { rows: [{ profile_id: 'profile-1' }] };
    return { rowCount: 1, rows: [] };
  };
  store.pool = {
    query,
    async connect() {
      return {
        query,
        release() {},
      };
    },
  };
  const record = {
    id: 'vk_new', name: 'service', secretHash: 'hash', applicationId: 'old-app', groupId: 'old-group',
    profileId: 'profile-1', containerName: null, configPluginId: 'config-vault', revokedAt: null,
    createdAt: '2026-10-02T00:00:00Z',
  };

  await store.createRuntimeKey(record);
  const creationLock = calls.findIndex(({ sql }) => /for share of a, g, p/i.test(sql));
  const creationInsert = calls.findIndex(({ sql }) => sql.includes('insert into vault_runtime_keys'));
  assert.ok(creationLock > 0 && creationLock < creationInsert);
  assert.deepEqual(calls[creationInsert].params.slice(3, 6), ['new-app', 'new-group', 'profile-1']);
  assert.equal(calls.at(-1).sql, 'commit');

  calls.length = 0;
  assert.equal(await store.rotateRuntimeKey('vk_old', record), true);
  const rotationLock = calls.findIndex(({ sql }) => /for share of a, g, p/i.test(sql));
  const revoke = calls.findIndex(({ sql }) => sql.includes('update vault_runtime_keys set revoked_at'));
  const rotationInsert = calls.findIndex(({ sql }) => sql.includes('insert into vault_runtime_keys'));
  assert.ok(rotationLock > 0 && rotationLock < revoke && revoke < rotationInsert);
  assert.deepEqual(calls[rotationInsert].params.slice(3, 6), ['new-app', 'new-group', 'profile-1']);
  assert.equal(calls.at(-1).sql, 'commit');
};
