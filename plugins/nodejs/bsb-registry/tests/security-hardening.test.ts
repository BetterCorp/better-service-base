import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import handlebars from 'handlebars';
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

test('registry index is reused, invalidated by writes, and applies permissions on every read', async () => {
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
    assert.equal(scans, 3);
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});

test('public list and search only clone returned pages, while keeping cached entries isolated', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'bsb-registry-page-clones-'));
  try {
    const db = new FileDB(dataDir);
    await db.init(obs);
    for (let index = 0; index < 3; index++) {
      await db.insert(obs, {
        id: `org/plugin-${index}`, org: 'org', name: `plugin-${index}`,
        displayName: `Plugin ${index}`, description: 'Example', tags: [],
        version: '1.0.0', language: 'nodejs', category: 'service',
        publishedAt: `2026-01-0${index + 1}T00:00:00Z`, documentation: ['large public document'],
      } as any);
    }
    const original = structuredClone;
    let copies = 0;
    t.mock.method(globalThis, 'structuredClone', (value: unknown) => {
      copies++;
      return original(value);
    });
    const listed = await db.list(obs, { limit: 1 });
    assert.equal(listed.total, 3);
    assert.equal(copies, 1);
    listed.results[0].description = 'changed by caller';
    assert.equal((await db.list(obs, { limit: 1 })).results[0].description, 'Example');
    copies = 0;
    assert.equal((await db.search(obs, { query: 'plugin', limit: 1 })).total, 3);
    assert.equal(copies, 1);
    copies = 0;
    await db.getStats(obs);
    assert.equal(copies, 0);
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
        let intercepted = false;
        const mocked = t.mock.method(fs, 'readdir', async (...args: any[]) => {
          if (args[0] === directory) {
            intercepted = true;
            throw Object.assign(new Error(code), { code });
          }
          return (readDirectory as any)(...args);
        });
        try {
          if (code === 'ENOENT') assert.equal((await db.list(obs, {})).total, 0);
          else await assert.rejects(db.list(obs, {}), { code });
          assert.ok(intercepted);
        } finally { mocked.mock.restore(); }
        if (code === 'EACCES') assert.equal((await db.list(obs, {})).total, 1);
      }
    }
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});

test('registry markdown escapes raw HTML and rejects active URLs', () => {
  const server = new RegistryUIServer(0, '127.0.0.1', 10, './unused', undefined, 1, []);
  const html = (server as any).renderMarkdown('<script>alert(1)</script>\n[x](javascript:alert(1))\n![x](data:image/svg+xml,x)');
  assert.doesNotMatch(html, /<script|javascript:|data:image/i);
  assert.match(html, /&lt;script&gt;/);
});

test('publisher metadata cannot create active links in registry detail views', async () => {
  const server = new RegistryUIServer(0, '127.0.0.1', 10, './unused', undefined, 1, []);
  const template = handlebars.compile(await readFile(fileURLToPath(new URL('../src/plugins/service-bsb-registry-ui/templates/pages/plugin-detail.hbs', import.meta.url)), 'utf8'));
  const plugin = {
    id: 'org/plugin', name: 'plugin', displayName: 'Plugin', version: '1.0.0',
    description: 'A plugin', language: 'nodejs', category: 'service',
    repository: 'javascript:alert(1)', homepage: 'https://example.com/docs',
  };
  const source = await readFile(fileURLToPath(new URL('../src/plugins/service-bsb-registry-ui/static/js/app.js', import.meta.url)), 'utf8');
  const modalBody = { innerHTML: '' };
  const document = {
    addEventListener: () => undefined,
    getElementById: (id: string) => id === 'modalBody' ? modalBody : { classList: { add: () => undefined } },
    createElement: () => ({
      set textContent(value: string) { this.innerHTML = value.replace(/[&<>"']/g, (char: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!); },
      innerHTML: '',
    }),
  };
  const renderModal = runInNewContext(`${source}\nshowPluginDetail`, {
    document, console, URL,
    fetch: async () => ({ ok: true, json: async () => plugin }),
  }) as (id: string) => Promise<void>;
  for (const repository of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,hi', '//evil.example/path', 'https://user:pass@evil.example/path']) {
    plugin.repository = repository;
    const html = template({ plugin: (server as any).enrichPlugin(plugin) }, { helpers: (server as any).getHandlebarsHelpers() });
    assert.doesNotMatch(html, /href="(?:javascript:|data:|\/\/evil\.example|https:\/\/user:pass@)/i);
    assert.match(html, /href="https:\/\/example\.com\/docs"/);
    assert.ok(html.includes(repository));
    await renderModal('org/plugin');
    assert.doesNotMatch(modalBody.innerHTML, /href="(?:javascript:|data:|\/\/evil\.example|https:\/\/user:pass@)/i);
    assert.match(modalBody.innerHTML, /href="https:\/\/example\.com\/docs"/);
  }
  plugin.repository = 'https://example.com/repo';
  const validHtml = template({ plugin: (server as any).enrichPlugin(plugin) }, { helpers: (server as any).getHandlebarsHelpers() });
  assert.match(validHtml, /href="https:\/\/example\.com\/repo"/);
  await renderModal('org/plugin');
  assert.match(modalBody.innerHTML, /href="https:\/\/example\.com\/repo"/);
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
