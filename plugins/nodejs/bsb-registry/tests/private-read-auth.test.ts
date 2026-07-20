import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { Observable } from '@bsb/base';
import { AuthManager } from '../src/plugins/service-bsb-registry/auth.js';
import { FileDB } from '../src/plugins/service-bsb-registry/db/file.js';
import type { PackagePermission, RegistryEntry } from '../src/plugins/service-bsb-registry/types.js';

const noop = () => undefined;
const obs = {
  startSpan: () => ({ end: noop, setAttributes: noop }),
  log: { debug: noop, info: noop, warn: noop, error: noop },
} as unknown as Observable;

function entry(
  org: string,
  name: string,
  version: string,
  visibility: 'public' | 'private',
  publishedBy: string,
  publishedAt: string,
  permissions?: PackagePermission[],
): RegistryEntry {
  return {
    id: `${org}/${name}`,
    org,
    name,
    displayName: name,
    description: `${name} description`,
    version,
    majorMinor: version.split('.').slice(0, 2).join('.'),
    language: 'nodejs',
    category: 'service',
    tags: [],
    visibility,
    eventSchema: {},
    permissions,
    eventCount: 0,
    emitEventCount: 0,
    onEventCount: 0,
    returnableEventCount: 0,
    broadcastEventCount: 0,
    publishedBy,
    publishedAt,
    updatedAt: publishedAt,
    downloads: 0,
  };
}

test('private plugin reads require read and resource access', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'bsb-registry-private-read-'));
  const db = new FileDB(dataDir);

  try {
    await db.init(obs);
    const auth = new AuthManager({ requireAuth: true }, db);
    const reader = await auth.createUser(obs, 'Reader', 'reader@example.com', ['read']);
    const readerToken = await auth.createToken(obs, reader.id, 'reader');
    assert.ok(readerToken);

    const publisher = await auth.createUser(obs, 'Publisher', 'publisher@example.com', ['write']);
    const publisherToken = await auth.createToken(obs, publisher.id, 'publisher');
    assert.ok(publisherToken);

    await db.createOrganization(obs, 'shared', 'Shared', 'private');
    await db.setOrgMember(obs, 'shared', reader.id, 'read');

    await db.insert(obs, entry('shared', 'mixed', '1.0.0', 'public', publisher.id, '2025-01-01T00:00:00.000Z'));
    await db.insert(obs, entry('shared', 'mixed', '2.0.0', 'private', publisher.id, '2026-01-01T00:00:00.000Z'));
    await db.insert(obs, entry('shared', 'private-only', '1.0.0', 'private', publisher.id, '2026-02-01T00:00:00.000Z'));
    await db.insert(obs, entry('open', 'visible', '1.0.0', 'public', publisher.id, '2024-01-01T00:00:00.000Z'));
    await db.insert(obs, entry('locked', 'package-grant', '1.0.0', 'private', publisher.id, '2026-03-01T00:00:00.000Z', [
      { userId: reader.id, permission: 'read' },
    ]));
    await db.insert(obs, entry('locked', 'denied', '1.0.0', 'private', publisher.id, '2026-04-01T00:00:00.000Z'));

    const anonymous = await auth.createPluginReadFilter(obs);
    const anonymousList = await db.list(obs, { limit: 1, offset: 0 }, anonymous);
    assert.equal(anonymousList.total, 2);
    assert.equal(anonymousList.results.length, 1);
    assert.equal((await db.get(obs, 'shared', 'mixed', undefined, anonymous))?.version, '1.0.0');
    assert.deepEqual((await db.getVersions(obs, 'shared', 'mixed', undefined, anonymous)).map(v => v.version), ['1.0.0']);
    assert.equal((await db.getStats(obs, anonymous)).totalPlugins, 2);

    const authorized = await auth.createPluginReadFilter(obs, readerToken.token);
    const authorizedList = await db.list(obs, { limit: 100, offset: 0 }, authorized);
    assert.equal(authorizedList.total, 4);
    assert.equal((await db.get(obs, 'shared', 'mixed', undefined, authorized))?.version, '2.0.0');
    assert.deepEqual((await db.getVersions(obs, 'shared', 'mixed', undefined, authorized)).map(v => v.version), ['2.0.0', '1.0.0']);
    assert.ok(await db.get(obs, 'locked', 'package-grant', undefined, authorized));
    assert.equal(await db.get(obs, 'locked', 'denied', undefined, authorized), null);
    assert.equal((await db.getStats(obs, authorized)).totalPlugins, 4);

    const publisherWithoutRead = await auth.createPluginReadFilter(obs, publisherToken.token);
    assert.equal(await db.get(obs, 'locked', 'denied', undefined, publisherWithoutRead), null);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
