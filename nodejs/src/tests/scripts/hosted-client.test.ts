import * as assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { hostedSchema } from '../../scripts/hosted-client.js';

const run = promisify(execFile);
describe('Hosted client discovery', () => {
  it('installs through the public CLI, refreshes offline snapshots and keeps credentials local', async function () {
    this.timeout(30000);
    const fixture = JSON.parse(await readFile('../tests/fixtures/hosted-discovery.json', 'utf8'));
    let discovery = structuredClone(fixture);
    let redirect = false;
    let oversized = false;
    const seen: Array<{ path?: string; authorization?: string }> = [];
    const server = createServer((req, res) => {
      seen.push({ path: req.url, authorization: req.headers.authorization });
      if (redirect) { res.writeHead(302, { location: '/contracts/report.json' }); res.end(); return; }
      res.setHeader('Content-Type', 'application/json');
      res.end(oversized ? ' '.repeat(4 * 1024 * 1024 + 1) : JSON.stringify(req.url === '/.well-known/bsb' ? discovery : fixture.plugins[0].schema));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const endpoint = `http://127.0.0.1:${address.port}`;
    const cwd = await mkdtemp(path.join(tmpdir(), 'bsb-hosted-'));
    try {
      const cli = path.resolve('lib/cli.js');
      const env = { ...process.env, BSB_REGISTRY_TOKEN: 'must-stay-local' };
      await run(process.execPath, [cli, 'client', 'install', endpoint, '--allow-insecure'], { cwd, env });
      const local = `hosted~${createHash('sha256').update(endpoint).digest('hex').slice(0, 16)}~acme~service-reports~nodejs`;
      const snapshot = path.join(cwd, 'src/.bsb/schemas', `${local}.json`);
      const saved = JSON.parse(await readFile(snapshot, 'utf8'));
      assert.equal(saved.pluginId, 'service-reports');
      assert.equal(saved.source.url, endpoint);
      assert.deepEqual(saved.events, fixture.plugins[0].schema.events);
      assert.match(await readFile(path.join(cwd, 'src/.bsb/clients', `${local}.ts`), 'utf8'), /lookup/);
      discovery.plugins[0].schema = '/contracts/report.json';
      await run(process.execPath, [cli, 'client', 'install', endpoint, '--allow-insecure', '--plugin', 'acme/service-reports', '--version', '1.2.3-beta.1'], { cwd, env });
      assert.ok(seen.some(request => request.path === '/contracts/report.json'));
      assert.ok(seen.every(request => request.authorization === undefined));
      const before = await readFile(snapshot, 'utf8');
      discovery.plugins.push({ ...discovery.plugins[0], id: 'acme/second' });
      await assert.rejects(run(process.execPath, [cli, 'client', 'install', endpoint, '--allow-insecure'], { cwd, env }), (error: any) => /unique hosted/.test(error.stdout));
      assert.equal(await readFile(snapshot, 'utf8'), before);
      discovery.plugins.pop();
      discovery.plugins[0].schema = 'https://elsewhere.invalid/schema';
      await assert.rejects(hostedSchema(endpoint, { allowInsecure: true }), /same origin/);
      discovery.plugins[0].schema = '/contracts/report.json';
      discovery.bsb = '1';
      await assert.rejects(hostedSchema(endpoint, { allowInsecure: true }), /discovery document/);
      discovery = structuredClone(fixture);
      delete discovery.plugins[0].schema.events.lookup.outputSchema;
      await assert.rejects(run(process.execPath, [cli, 'client', 'install', endpoint, '--allow-insecure'], { cwd, env }), (error: any) => /AnyVali documents/.test(error.stdout));
      assert.equal(await readFile(snapshot, 'utf8'), before);
      discovery = structuredClone(fixture);
      discovery.plugins[0].schema.version = '9.0.0';
      await assert.rejects(hostedSchema(endpoint, { allowInsecure: true }), /version does not match/);
      discovery = structuredClone(fixture);
      discovery.plugins[0].version = '../invalid';
      await assert.rejects(hostedSchema(endpoint, { allowInsecure: true }), /metadata/);
      for (const root of [
        { kind: 'string', pattern: '^(a+)+$' },
        { kind: 'string', pattern: 'a'.repeat(1025) },
        JSON.parse('{"kind":"object","properties":{"__proto__":{"kind":"string"}}}'),
        Array.from({ length: 66 }).reduce<object>(inner => ({ kind: 'optional', inner }), { kind: 'string' }),
      ]) {
        discovery = structuredClone(fixture);
        discovery.plugins[0].schema.events.lookup.outputSchema.root = root;
        await assert.rejects(run(process.execPath, [cli, 'client', 'install', endpoint, '--allow-insecure'], { cwd, env }),
          (error: any) => /unsafe regular expression|forbidden key|maximum nesting depth/.test(error.stdout));
        assert.equal(await readFile(snapshot, 'utf8'), before);
      }
      redirect = true;
      await assert.rejects(hostedSchema(endpoint, { allowInsecure: true }));
      redirect = false; oversized = true;
      await assert.rejects(hostedSchema(endpoint, { allowInsecure: true }), /4 MiB/);
      const requests = seen.length;
      await assert.rejects(hostedSchema(endpoint));
      await assert.rejects(hostedSchema(endpoint + '/api', { allowInsecure: true }));
      await run(process.execPath, [path.resolve('lib/scripts/generate-client-types.js')], { cwd, env });
      assert.equal(seen.length, requests);
      assert.equal((await readdir(path.dirname(snapshot))).length, 1);
      // Name collisions must not overwrite an existing snapshot.
      await writeFile(path.join(path.dirname(snapshot), local.replace(/~/g, '-') + '.json'), '{}');
      oversized = false; discovery = structuredClone(fixture);
      await assert.rejects(run(process.execPath, [cli, 'client', 'install', endpoint, '--allow-insecure'], { cwd, env }), (error: any) => /collide/.test(error.stdout));
      assert.equal(await readFile(snapshot, 'utf8'), before);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
