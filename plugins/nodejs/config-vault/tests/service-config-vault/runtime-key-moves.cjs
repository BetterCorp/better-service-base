const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

module.exports = async ({ pluginRoot }) => {
  const { VaultStore } = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/store.js')).href);
  const run = async (kind, previousId, nextId) => {
    const statements = [];
    const store = Object.create(VaultStore.prototype);
    store.pool = {
      async connect() {
        return {
          async query(sql) {
            statements.push(sql);
            if (sql.startsWith('select application_id')) return { rows: [{ application_id: previousId }] };
            if (sql.startsWith('select group_id')) return { rows: [{ group_id: previousId }] };
            return { rowCount: 1, rows: [] };
          },
          release() {},
        };
      },
    };
    if (kind === 'group') await store.updateGroup('group-1', nextId, 'API');
    else await store.updateProfile('profile-1', nextId, 'default');
    assert.equal(statements[0], 'begin');
    assert.equal(statements.at(-1), 'commit');
    return statements;
  };

  const groupMove = await run('group', 'old-app', 'new-app');
  assert.ok(groupMove.some((sql) => sql.includes('update vault_runtime_keys set revoked_at') && sql.includes('group_id = $1')));
  const profileMove = await run('profile', 'old-group', 'new-group');
  assert.ok(profileMove.some((sql) => sql.includes('update vault_runtime_keys set revoked_at') && sql.includes('profile_id = $1')));
  assert.equal((await run('group', 'app', 'app')).some((sql) => sql.includes('update vault_runtime_keys set revoked_at')), false);
  assert.equal((await run('profile', 'group', 'group')).some((sql) => sql.includes('update vault_runtime_keys set revoked_at')), false);
};
