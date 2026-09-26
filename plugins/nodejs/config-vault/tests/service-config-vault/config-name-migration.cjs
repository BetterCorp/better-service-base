const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

module.exports = async ({ pluginRoot }) => {
  const load = (file) => import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault', file)).href);
  const { VaultService } = await load('vault.js');
  const { VaultStore } = await load('store.js');
  const { encryptJson, decryptJson } = await load('crypto.js');
  const key = Buffer.alloc(32);
  const scopes = [
    ['profile-draft', 'vault_config_drafts', 'vault:profile-draft:owner'],
    ['profile-version', 'vault_config_versions', 'vault:profile-version:owner:record'],
    ['application-draft', 'vault_application_config_drafts', 'vault:application-draft:owner'],
    ['application-version', 'vault_application_config_versions', 'vault:application-version:owner:record'],
  ];
  const entry = { plugin: 'service-auth', config: { url: 'https://example.org/a/b', secret: 'a/b' }, enabled: true };
  const initial = { default: { services: { 'betterportal/service-auth': entry }, events: { 'org/events': entry }, observable: { 'org/log': entry } }, prod: { services: { 'a/b/c': { override: true, config: { url: 'a/b' } } } } };
  let rows = new Map(scopes.map(([kind, table, aad]) => [table, { id: 'record', owner_id: 'owner', ...toRow(encryptJson(initial, key, 'v2', aad)) }]));
  let completed = false;
  let transaction;
  let commits = 0;
  let rollbacks = 0;
  function toRow(record) { return { encrypted_payload: record.encryptedPayload, iv: record.iv, auth_tag: record.authTag, key_version: record.keyVersion }; }
  const store = Object.create(VaultStore.prototype);
  store.pool = { async connect() { return {
    async query(sql, values) {
      if (sql === 'begin') transaction = { rows: structuredClone(rows), completed };
      if (sql.startsWith('select name from')) return { rows: completed ? [{ name: 'config-name-slashes-v1' }] : [] };
      if (sql.startsWith('select id,')) return { rows: [rows.get(sql.split(' from ')[1])] };
      if (sql.startsWith('update ')) {
        const table = sql.split(' ')[1];
        rows.set(table, { ...rows.get(table), encrypted_payload: values[0], iv: values[1], auth_tag: values[2], key_version: values[3] });
      }
      if (sql.startsWith('insert into vault_data_migrations')) completed = true;
      if (sql === 'commit') commits++;
      if (sql === 'rollback') { rows = transaction.rows; completed = transaction.completed; rollbacks++; }
      return { rows: [] };
    }, release() {},
  }; } };
  const vault = new VaultService({ store, masterKey: key, setupCode: 'setup', publicUrl: 'http://localhost' });
  assert.equal(await vault.migrateConfigNames(), 4);
  assert.equal(completed, true);
  for (const [, table, aad] of scopes) {
    const row = rows.get(table);
    const config = decryptJson({ encryptedPayload: row.encrypted_payload, iv: row.iv, authTag: row.auth_tag, keyVersion: row.key_version }, key, aad);
    assert.deepEqual(config.default.services['betterportal_service-auth'], entry);
    assert.deepEqual(config.default.events.org_events, entry);
    assert.deepEqual(config.default.observable.org_log, entry);
    assert.deepEqual(config.prod.services.a_b_c, initial.prod.services['a/b/c']);
    assert.equal(Object.hasOwn(config.default.services, 'betterportal/service-auth'), false);
  }
  const migrated = structuredClone(rows);
  assert.equal(await vault.migrateConfigNames(), 0);
  assert.deepEqual(rows, migrated);
  assert.equal(commits, 2);

  completed = false;
  // A collision in the last table must roll back changes to earlier tables too.
  rows = new Map(scopes.map(([, table, aad], i) => [table, { id: 'record', owner_id: 'owner', ...toRow(encryptJson(i === 3 ? { default: { services: { 'a/b': entry, a_b: entry } } } : initial, key, 'v2', aad)) }]));
  const before = structuredClone(rows);
  await assert.rejects(vault.migrateConfigNames(), /migration collision/);
  assert.deepEqual(rows, before);
  assert.equal(completed, false);
  assert.equal(rollbacks, 1);
};
