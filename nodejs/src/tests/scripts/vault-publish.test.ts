import * as assert from 'node:assert';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

describe('Vault plugin publishing', () => {
  it('publishes one generated schema to the target Vault without documentation', async () => {
    const project = await mkdtemp(path.join(tmpdir(), 'bsb-vault-publish-'));
    const token = `bv_p_service-private-api_123456789012_${'a'.repeat(43)}`;
    let request: { url?: string; authorization?: string; body?: Record<string, unknown> } = {};
    const server = createServer((incoming, response) => {
      let raw = '';
      incoming.on('data', (chunk) => { raw += chunk; });
      incoming.on('end', () => {
        request = {
          url: incoming.url,
          authorization: incoming.headers.authorization,
          body: JSON.parse(raw) as Record<string, unknown>,
        };
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ status: 'published', plugin: { version: '1.2.3' } }));
      });
    });

    try {
      await mkdir(path.join(project, 'lib', 'schemas'), { recursive: true });
      await writeFile(path.join(project, 'package.json'), JSON.stringify({
        name: '@example/private-api', version: '1.2.3', bsb: { orgId: 'example' },
      }));
      await writeFile(path.join(project, 'bsb-plugin.json'), JSON.stringify({
        nodejs: [{ id: 'service-private-api', name: 'Private API' }],
      }));
      await writeFile(path.join(project, 'lib', 'schemas', 'service-private-api.json'), JSON.stringify({
        pluginName: 'Private API', version: '1.2.3', events: {}, pluginType: 'service',
        configSchema: { root: { kind: 'object', properties: {} } },
      }));
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      const cli = path.resolve('lib/scripts/bsb-client-cli.js');
      const result = await execFileAsync(process.execPath, [
        cli, 'publish', '--target', `http://127.0.0.1:${address.port}`, '--plugin', 'service-private-api', '--token', token,
      ], { cwd: project });

      assert.equal(request.url, '/api/plugins/publish');
      assert.equal(request.authorization, `Bearer ${token}`);
      assert.equal(request.body?.name, 'service-private-api');
      assert.deepEqual(request.body?.eventSchema, {
        pluginId: 'service-private-api',
        pluginName: 'service-private-api',
        displayName: 'Private API',
        version: '1.2.3',
        events: {},
      });
      assert.deepEqual(request.body?.package, { nodejs: '@example/private-api' });
      assert.equal('documentation' in (request.body ?? {}), false);
      assert.equal(result.stdout.includes(token), false);
      assert.match(result.stdout, /Published: example\/service-private-api @ 1\.2\.3/);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(project, { recursive: true, force: true });
    }
  });
});
