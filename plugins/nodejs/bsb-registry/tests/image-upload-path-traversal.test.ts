import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import { RegistryUIServer } from '../src/plugins/service-bsb-registry-ui/http-server.js';

const noop = () => undefined;
const trace = {
  startSpan: () => ({ end: noop }),
  log: { debug: noop, info: noop, warn: noop, error: noop },
};

type TestableRegistryServer = {
  createTrace: () => typeof trace;
  registryClient: {
    registryAuthVerify: () => Promise<{ valid: boolean; userId: string }>;
    registryPluginGet: () => Promise<{ id: string; publishedBy: string }>;
  };
  handleImageUpload(request: FastifyRequest, reply: FastifyReply): Promise<void>;
};

function multipartImage(boundary: string): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n`
      + 'Content-Disposition: form-data; name="image"; filename="poc.png"\r\n'
      + 'Content-Type: image/png\r\n\r\n',
    ),
    Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
}

for (const encodedOrg of ['..%2Foutside', '%2E%2E%2Foutside']) {
  test(`image upload rejects path traversal in org: ${encodedOrg}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'bsb-registry-image-traversal-'));
    const uploadDir = join(root, 'uploads');
    const escapedFile = join(root, 'outside__plugin.png');
    const server = new RegistryUIServer(0, '127.0.0.1', 10, uploadDir, undefined, 1, []);
    const internals = server as unknown as TestableRegistryServer;
    internals.createTrace = () => trace;
    internals.registryClient = {
      registryAuthVerify: async () => ({ valid: true, userId: 'attacker' }),
      registryPluginGet: async () => ({ id: '../outside/plugin', publishedBy: 'attacker' }),
    };

    const app = Fastify();
    await app.register(fastifyMultipart);
    app.post('/plugins/:org/:name/image', (request, reply) => (
      internals.handleImageUpload(request, reply)
    ));

    const boundary = 'bsb-path-traversal-poc';
    try {
      const response = await app.inject({
        method: 'POST',
        url: `/plugins/${encodedOrg}/plugin/image`,
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        body: multipartImage(boundary),
      });

      assert.equal(
        existsSync(escapedFile),
        false,
        `upload escaped uploadDir and wrote ${escapedFile}`,
      );
      assert.equal(response.statusCode, 400);
      assert.equal(response.json().code, 'INVALID_INPUT');
    } finally {
      await app.close();
      await rm(root, { recursive: true, force: true });
    }
  });
}
