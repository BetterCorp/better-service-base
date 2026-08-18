import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
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
