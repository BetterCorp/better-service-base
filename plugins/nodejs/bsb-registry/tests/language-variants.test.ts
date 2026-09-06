import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Fastify from 'fastify';
import { normalizePluginLanguage, type Observable, type PluginLanguage } from '@bsb/base';
import { FileDB } from '../src/plugins/service-bsb-registry/db/file.js';
import type { RegistryEntry } from '../src/plugins/service-bsb-registry/types.js';
import { RegistryUIServer } from '../src/plugins/service-bsb-registry-ui/http-server.js';

const noop = () => undefined;
const obs = { startSpan: () => ({ end: noop }), log: { debug: noop, info: noop, error: noop } } as unknown as Observable;
const entry = (language: PluginLanguage, version = '1.0.0'): RegistryEntry => ({
  id: 'acme/service-demo', org: 'acme', name: 'service-demo', displayName: 'Demo', description: 'Demo service',
  language, version, majorMinor: version.split('.').slice(0, 2).join('.'), category: 'service', tags: [],
  visibility: 'public', eventSchema: {}, eventCount: 0, emitEventCount: 0, onEventCount: 0,
  returnableEventCount: 0, broadcastEventCount: 0, publishedBy: 'owner',
  publishedAt: version === '1.0.0' ? '2026-01-01T00:00:00Z' : '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z',
});

test('Registry limits requests before authorization without trusting forwarded IPs', async () => {
  const server = new RegistryUIServer(0, '127.0.0.1', 10, '.', undefined, 1, [], 2);
  const app = Fastify();
  const internals = server as any;
  internals.app = app;
  internals.createTrace = () => obs;
  let calls = 0;
  internals.registryClient = { registryPluginImplementations: async () => {
    calls++;
    return { implementations: [] };
  } };
  await internals.registerRateLimit();
  internals.registerRoutes();
  try {
    for (let i = 0; i < 3; i++) {
      const response = await app.inject({ url: '/plugins/acme/demo/implementations',
        headers: { authorization: `Bearer token-${i}`, 'x-forwarded-for': `192.0.2.${i}` } });
      assert.equal(response.statusCode, i < 2 ? 200 : 429, response.body);
      if (i === 2) assert.ok(Number(response.headers['retry-after']) > 0);
    }
    assert.equal(calls, 2);
    assert.equal((await app.inject('/health')).statusCode, 200);
    assert.equal((await app.inject({ url: '/plugins/acme/demo/implementations', remoteAddress: '192.0.2.10' })).statusCode, 200);
  } finally { await app.close(); }
});

test('HTTP implementation language is independent from generated type language', async () => {
  const server = new RegistryUIServer(0, '127.0.0.1', 10, '.', undefined, 1, []);
  const app = Fastify();
  const calls: Record<string, unknown>[] = [];
  const internals = server as any;
  internals.app = app;
  internals.createTrace = () => obs;
  internals.registryClient = {
    registryPluginImplementations: async (_obs: unknown, input: Record<string, unknown>) => {
      calls.push(input);
      return { implementations: [entry('nodejs'), entry('csharp')] };
    },
    registryPluginGet: async (_obs: unknown, input: Record<string, unknown>) => {
      calls.push(input);
      return { ...entry(input.language as PluginLanguage), typeDefinitions: { python: '# Python types' } };
    },
    registryPluginVersions: async (_obs: unknown, input: Record<string, unknown>) => {
      calls.push(input);
      return { versions: [{ version: '1.0.0', language: input.language }], latest: '1.0.0', latestForMajorMinor: '{}' };
    },
  };
  internals.registerRoutes();
  try {
    const implementations = await app.inject('/plugins/acme/service-demo/implementations');
    assert.equal(implementations.statusCode, 200, implementations.body);
    assert.deepEqual(implementations.json().implementations.map((item: RegistryEntry) => item.language), ['nodejs', 'csharp']);
    for (const suffix of ['versions', '1.0.0/schema', '1.0.0/types/python']) {
      const response = await app.inject(`/plugins/acme/service-demo/${suffix}?language=dotnet`);
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(calls.at(-1)?.language, 'csharp');
    }
    const count = calls.length;
    const invalid = await app.inject('/plugins/acme/service-demo/versions?language=bad');
    assert.equal(invalid.statusCode, 400);
    assert.equal(calls.length, count);
  } finally { await app.close(); }
});

test('language variants coexist with legacy files, filter independently and delete independently', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bsb-variants-'));
  const db = new FileDB(dir);
  try {
    await db.init(obs);
    const legacyDir = join(dir, 'plugins/acme/service-demo');
    await mkdir(legacyDir, { recursive: true });
    await writeFile(join(legacyDir, '1.0.0.json'), JSON.stringify(entry('nodejs')));
    await db.insert(obs, entry('csharp'));
    await db.insert(obs, entry('python'));
    await db.insert(obs, entry('python', '2.0.0'));
    await assert.rejects(db.insert(obs, entry('nodejs')), /immutable/);
    const writes = await Promise.allSettled([db.insert(obs, entry('rust')), db.insert(obs, entry('rust'))]);
    assert.equal(writes.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((await db.get(obs, 'acme', 'service-demo'))?.language, 'nodejs');
    assert.equal((await db.get(obs, 'acme', 'service-demo', undefined, undefined, 'python'))?.version, '2.0.0');
    assert.equal(await db.get(obs, 'acme', 'service-demo', '2.0.0', undefined, 'csharp'), null);
    assert.equal((await db.list(obs, {})).total, 4);
    assert.deepEqual((await db.list(obs, { language: 'nodejs' })).results.map(item => item.version), ['1.0.0']);
    assert.equal((await db.search(obs, { query: 'demo', language: 'csharp' })).total, 1);
    assert.deepEqual((await db.getVersions(obs, 'acme', 'service-demo', undefined, undefined, 'python')).map(item => item.version), ['2.0.0', '1.0.0']);
    await db.delete(obs, 'acme', 'service-demo', '1.0.0', 'csharp');
    assert.ok(await db.get(obs, 'acme', 'service-demo', '1.0.0', undefined, 'nodejs'));
    assert.equal(await db.get(obs, 'acme', 'service-demo', undefined, undefined, 'csharp'), null);
    await db.delete(obs, 'acme', 'service-demo', undefined, 'nodejs');
    await assert.rejects(db.get(obs, 'acme', 'service-demo'), /specify language/);
    await assert.rejects(db.delete(obs, 'acme', 'service-demo'), /specify language/);
    const pythonOnly = (item: RegistryEntry) => item.language === 'python';
    assert.equal((await db.get(obs, 'acme', 'service-demo', undefined, pythonOnly))?.language, 'python');
    const reopened = new FileDB(dir);
    await reopened.init(obs);
    assert.equal((await reopened.list(obs, {})).total, 2);
    assert.equal(normalizePluginLanguage('dotnet'), 'csharp');
    assert.throws(() => normalizePluginLanguage('../nodejs'), /Unsupported/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
