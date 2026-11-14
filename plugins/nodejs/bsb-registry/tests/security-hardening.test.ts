import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { Observable } from '@bsb/base';
import { AuthManager } from '../src/plugins/service-bsb-registry/auth.js';
import { FileDB } from '../src/plugins/service-bsb-registry/db/file.js';
import { Plugin as RegistryPlugin } from '../src/plugins/service-bsb-registry/index.js';
import { RegistryUIServer } from '../src/plugins/service-bsb-registry-ui/http-server.js';

const noop = () => undefined;
const obs = {
  startSpan: () => ({ end: noop, setAttributes: noop }),
  log: { debug: noop, info: noop, warn: noop, error: noop },
} as unknown as Observable;

test('registry tokens are hashed at rest and an empty scope grants nothing', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'bsb-registry-token-'));
  try {
    const db = new FileDB(dataDir);
    await db.init(obs);
    const auth = new AuthManager({ requireAuth: true }, db);
    const user = await auth.createUser(obs, 'Publisher', 'publisher@example.com', ['read', 'write']);
    const token = await auth.createToken(obs, user.id, 'no-access', []);
    assert.ok(token);
    assert.equal((await readFile(join(dataDir, 'tokens.json'), 'utf8')).includes(token.token), false);
    assert.deepEqual((await auth.resolveToken(obs, token.token))?.effectivePermissions, []);
    const stored = JSON.parse(await readFile(join(dataDir, 'tokens.json'), 'utf8'));
    assert.equal(await auth.resolveToken(obs, stored[0].token), null);
    assert.deepEqual((await auth.resolveToken(obs, token.token))?.effectivePermissions, []);
    // A real legacy bearer token still migrates, without accepting a stored digest.
    await writeFile(join(dataDir, 'tokens.json'), JSON.stringify([token]));
    assert.ok(await auth.resolveToken(obs, token.token));
    assert.equal((await readFile(join(dataDir, 'tokens.json'), 'utf8')).includes(token.token), false);
    for (const legacy of ['manually-seeded-bearer', 'BSB_UPPERCASE', 'bsb_short']) {
      await writeFile(join(dataDir, 'tokens.json'), JSON.stringify([{ ...token, token: legacy }]));
      assert.ok(await auth.resolveToken(obs, legacy));
      const [migrated] = JSON.parse(await readFile(join(dataDir, 'tokens.json'), 'utf8'));
      assert.match(migrated.token, /^sha256:[A-Za-z0-9_-]{43}$/);
      assert.equal(await auth.resolveToken(obs, migrated.token), null);
      assert.ok(await auth.resolveToken(obs, legacy));
    }
    assert.equal(await auth.resolveToken(obs, ''), null);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('file storage rejects paths outside its data directory', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'bsb-registry-storage-'));
  try {
    const db = new FileDB(dataDir);
    await db.init(obs);
    await assert.rejects(() => db.createOrganization(obs, '../outside', 'Outside', 'public'), /Invalid storage path/);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('registry index is reused, updated by writes, and applies permissions on every read', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'bsb-registry-index-'));
  try {
    const db = new FileDB(dataDir);
    await db.init(obs);
    let scans = 0;
    const scan = (db as any).readPluginIndex.bind(db);
    (db as any).readPluginIndex = () => { scans++; return scan(); };
    const entry = { id: 'org/plugin', org: 'org', name: 'plugin', version: '1.0.0', publishedAt: '2026-01-01T00:00:00Z' } as any;
    await db.insert(obs, entry);
    assert.equal((await db.list(obs, {})).total, 1);
    assert.equal((await db.list(obs, {}, async () => false)).total, 0);
    assert.equal(scans, 1);
    await db.insert(obs, { ...entry, name: 'second', id: 'org/second' });
    assert.equal((await db.list(obs, {})).total, 2);
    await db.delete(obs, 'org', 'plugin');
    assert.equal((await db.list(obs, {})).total, 1);
    assert.equal(scans, 1);
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});

test('registry index tolerates removed directories but propagates other IO errors', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'bsb-registry-index-race-'));
  const readDirectory = fs.readdir;
  try {
    for (const parts of [[], ['org'], ['org', 'plugin']]) {
      for (const code of ['ENOENT', 'EACCES']) {
        const db = new FileDB(dataDir);
        await db.init(obs);
        const directory = join(dataDir, 'plugins', ...parts);
        const entry = { id: 'org/plugin', org: 'org', name: 'plugin', version: '1.0.0', publishedAt: '2026-01-01T00:00:00Z' } as any;
        await db.delete(obs, 'org', 'plugin');
        await db.insert(obs, entry);
        await rm(join(dataDir, 'registry-index-v1.json'), { force: true });
        const reopened = new FileDB(dataDir);
        await reopened.init(obs);
        let intercepted = false;
        const mocked = t.mock.method(fs, 'readdir', async (...args: any[]) => {
          if (args[0] === directory) {
            intercepted = true;
            throw Object.assign(new Error(code), { code });
          }
          return (readDirectory as any)(...args);
        });
        try {
          if (code === 'ENOENT') assert.equal((await reopened.list(obs, {})).total, 0);
          else await assert.rejects(reopened.list(obs, {}), { code });
          assert.ok(intercepted);
        } finally { mocked.mock.restore(); }
        if (code === 'EACCES') assert.equal((await reopened.list(obs, {})).total, 1);
      }
    }
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});

test('compact Registry index loads only the authorized page and supports exact package lookup', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'bsb-registry-compact-index-'));
  try {
    const db = new FileDB(dataDir);
    await db.init(obs);
    const base = {
      org: 'org', displayName: 'Plugin', description: 'description', version: '1.0.0', majorMinor: '1.0',
      language: 'nodejs', category: 'service', tags: [], eventSchema: {}, eventCount: 0, emitEventCount: 0,
      onEventCount: 0, returnableEventCount: 0, broadcastEventCount: 0, publishedBy: 'publisher',
      publishedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', downloads: 0,
    } as const;
    await db.insert(obs, { ...base, id: 'org/one', name: 'one', visibility: 'public', package: { nodejs: '@pkg/one' },
      documentation: ['x'.repeat(100_000)] } as any);
    await db.insert(obs, { ...base, id: 'org/two', name: 'two', visibility: 'private', package: { nodejs: '@pkg/two' },
      documentation: ['y'.repeat(100_000)] } as any);

    const reopened = new FileDB(dataDir);
    await reopened.init(obs);
    const readJson = (reopened as any).readJson.bind(reopened);
    let fullEntriesRead = 0;
    (reopened as any).readJson = (file: string) => {
      if (file.includes(`${join('plugins', 'org')}`)) fullEntriesRead++;
      return readJson(file);
    };
    const page = await reopened.list(obs, { limit: 1, offset: 0 }, async (entry) => entry.visibility === 'public');
    assert.equal(page.total, 1);
    assert.equal(page.results[0].name, 'one');
    assert.equal(fullEntriesRead, 1, 'list parsed payloads outside the authorized page');
    fullEntriesRead = 0;
    const exact = await reopened.list(obs, { language: 'nodejs', packageName: '@pkg/one', limit: 100, offset: 0 });
    assert.deepEqual(exact.results.map((entry) => entry.id), ['org/one']);
    assert.equal(fullEntriesRead, 1, 'exact package lookup parsed unrelated payloads');
    const persisted = JSON.parse(await readFile(join(dataDir, 'registry-index-v1.json'), 'utf8'));
    assert.equal(JSON.stringify(persisted).includes('x'.repeat(100)), false, 'compact index retained documentation payloads');
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});

test('file Registry enforces publication quotas atomically', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'bsb-registry-quotas-'));
  try {
    const db = new FileDB(dataDir, {
      maxEntryBytes: 20_000,
      maxVersionsPerPackage: 2,
      maxPackagesPerOrganization: 2,
      maxPackagesPerPublisher: 2,
      maxBytesPerOrganization: 30_000,
      maxBytesPerPublisher: 30_000,
      maxPublicationsPerMinute: 3,
      maxTotalVersions: 10,
    });
    await db.init(obs);
    const entry = (name: string, version: string, padding = '') => ({
      id: `org/${name}`, org: 'org', name, displayName: name, description: 'description', version,
      majorMinor: version.split('.').slice(0, 2).join('.'), language: 'nodejs', category: 'service', tags: [],
      visibility: 'public', eventSchema: {}, documentation: [padding], eventCount: 0, emitEventCount: 0,
      onEventCount: 0, returnableEventCount: 0, broadcastEventCount: 0, publishedBy: 'publisher',
      publishedAt: `2026-01-01T00:00:0${version[0]}Z`, updatedAt: '2026-01-01T00:00:00Z', downloads: 0,
    }) as any;
    await db.insert(obs, entry('one', '1.0.0'));
    const concurrent = await Promise.allSettled([
      db.insert(obs, entry('one', '1.0.1')),
      db.insert(obs, entry('one', '1.0.2')),
    ]);
    assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal((await db.getVersions(obs, 'org', 'one')).length, 2);
    await db.insert(obs, entry('two', '2.0.0'));
    await assert.rejects(db.insert(obs, entry('three', '3.0.0')), /package quota|rate quota/);
    await assert.rejects(db.insert(obs, entry('large', '4.0.0', 'x'.repeat(25_000))), /entry limit/);
    assert.equal((await db.list(obs, {})).total, 2);
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});

test('registry markdown escapes raw HTML and rejects active URLs', () => {
  const server = new RegistryUIServer(0, '127.0.0.1', 10, './unused', undefined, 1, []);
  const html = (server as any).renderMarkdown('<script>alert(1)</script>\n[x](javascript:alert(1))\n![x](data:image/svg+xml,x)');
  assert.doesNotMatch(html, /<script|javascript:|data:image/i);
  assert.match(html, /&lt;script&gt;/);
});

test('core write authorization rejects valid tokens without package ownership', async () => {
  const core = Object.create(RegistryPlugin.prototype) as any;
  core.authManager = {
    requireAuth: true,
    resolveToken: async () => ({ userId: 'attacker', effectivePermissions: ['write'] }),
    hasUserPermission: (_auth: unknown, permission: string) => permission === 'write',
    hasResourcePermission: () => false,
  };
  core.storage = {
    get: async () => ({ publishedBy: 'owner', permissions: [] }),
    getOrgMembers: async () => [],
  };
  await assert.rejects(
    () => core.authorizePluginWrite(obs, 'org', 'plugin', 'valid-token', false),
    /Package write permission required/,
  );
});

test('concurrent organization claims grant write access only to the winner', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'bsb-registry-org-claim-'));
  try {
    const db = new FileDB(dataDir);
    await db.init(obs);
    const original = db.getOrganization.bind(db);
    let arrivals = 0;
    let release!: () => void;
    const bothChecked = new Promise<void>((resolve) => { release = resolve; });
    t.mock.method(db, 'getOrganization', async (...args: any[]) => {
      const result = await (original as any)(...args);
      if (++arrivals === 2) release();
      await bothChecked;
      return result;
    });

    const core = Object.create(RegistryPlugin.prototype) as any;
    core.storage = db;
    core.authManager = {
      requireAuth: true,
      resolveToken: async (_obs: unknown, token: string) => ({ userId: token }),
      hasUserPermission: () => true,
      hasResourcePermission: (userId: string, _permission: string, _package: unknown, members: Array<{ userId: string }>) =>
        members.some((member) => member.userId === userId),
    };
    const attempts = await Promise.allSettled([
      core.authorizePluginWrite(obs, 'race-org', 'one', 'alice', true, 'nodejs'),
      core.authorizePluginWrite(obs, 'race-org', 'two', 'bob', true, 'nodejs'),
    ]);
    const winners = attempts.filter((attempt) => attempt.status === 'fulfilled');
    assert.equal(winners.length, 1);
    const members = await db.getOrgMembers(obs, 'race-org');
    assert.deepEqual(members.map((member) => member.userId), [(winners[0] as PromiseFulfilledResult<string>).value]);
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});
