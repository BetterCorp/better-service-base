import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { VaultStore } from '../../plugins/nodejs/config-vault/lib/plugins/service-config-vault/store.js';

const url = new URL(process.env.BSB_POSTGRES_URL ?? '');
const schema = `bsb_test_${randomUUID().replaceAll('-', '')}`;
const admin = new Pool({ connectionString: url.toString() });
await admin.query(`create schema "${schema}"`);
url.searchParams.set('options', `-c search_path=${schema}`);
const database = new Pool({ connectionString: url.toString() });
const store = new VaultStore(url.toString(), Buffer.alloc(32, 9));
const other = new VaultStore(url.toString(), Buffer.alloc(32, 9));
try {
  // The original tables deliberately omit language and enforce the old uniqueness constraints.
  await database.query(`
    create table vault_plugin_catalog (
      id text primary key, org text not null, name text not null, plugin_id text not null,
      package_name text, version text not null, kind text not null, source text not null,
      config_schema jsonb, event_schema jsonb, created_at timestamptz not null, unique(plugin_id, version));
    create table vault_plugin_publishers (
      plugin_id text primary key, org text not null, name text not null, package_name text not null,
      kind text not null, token_id text not null unique, secret_hash text not null,
      created_at timestamptz not null, rotated_at timestamptz not null);
    insert into vault_plugin_catalog values ('old','acme','Worker','service-worker','@acme/worker','1.0.0','service','manual',null,null,now());
    insert into vault_plugin_publishers values ('service-worker','acme','Worker','@acme/worker','service','node-token','hash',now(),now());
  `);
  await store.init();
  assert.equal((await store.listPlugins())[0].language, 'nodejs');
  assert.equal((await store.getPluginPublisher('service-worker')).tokenId, 'node-token');
  await Promise.all([store.init(), other.init()]);
  const now = new Date().toISOString();
  for (const language of ['csharp', 'python']) {
    const plugin = { id: language, org: 'acme', name: 'Worker', pluginId: 'service-worker', packageName: `${language}-worker`,
      version: '1.0.0', kind: 'service', source: 'manual', configSchema: null, eventSchema: null, createdAt: now, language };
    await store.createPrivatePlugin(plugin, { ...plugin, tokenId: `${language}-token`, secretHash: 'hash', rotatedAt: now });
    assert.equal((await store.getPluginPublisher('service-worker', language)).packageName, `${language}-worker`);
    assert.equal(await store.createPluginIfAbsent({ ...plugin, id: `${language}-duplicate` }), false);
  }
  assert.equal((await store.listPlugins()).length, 3);
  await store.rotatePluginPublisher('service-worker', 'python-rotated', 'new-hash', now, 'python');
  assert.equal((await store.getPluginPublisher('service-worker', 'python')).tokenId, 'python-rotated');
  assert.equal((await store.getPluginPublisher('service-worker', 'nodejs')).tokenId, 'node-token');
  await database.query(`
    insert into vault_applications (id,name,created_at) values ('app','App',now());
    insert into vault_groups (id,application_id,name,created_at) values ('group','app','Group',now());
    insert into vault_profiles (id,group_id,name,created_at) values ('profile','group','default',now());
  `);
  assert.equal((await database.query('select language from vault_profiles')).rows[0].language, 'nodejs');
  await store.updateProfile('profile', 'group', 'default', 'python');
  await store.createVersion({ id: 'version', profileId: 'profile', version: 0, encryptedPayload: 'test', iv: 'test', authTag: 'test', keyVersion: 'v1', publishedAt: now, publishedBy: 'admin' });
  await assert.rejects(store.updateProfile('profile', 'group', 'default', 'csharp'), /language is locked/);
  await store.updateProfile('profile', 'group', 'default', 'python');
  console.log('PASS: real PostgreSQL legacy migration, concurrent rerun, independent language versions/publishers and profile language locking');
} finally {
  await Promise.allSettled([store.close(), other.close(), database.end()]);
  // Only this randomly named schema, created by this test, is removed.
  await admin.query(`drop schema "${schema}" cascade`);
  await admin.end();
}
