import assert from 'node:assert/strict';
import test from 'node:test';
import { TodoHttpServer } from '../src/plugins/service-demo-todo/http-server.js';

test('unauthenticated demo API rejects non-loopback binds', async () => {
  const server = new TodoHttpServer(
    { port: 3000, host: '0.0.0.0', cors: false },
    process.cwd(),
    async () => ({ status: 200, data: {} }),
  );
  await assert.rejects(
    server.start({} as never, (() => undefined) as never),
    /may only bind to a loopback address/,
  );
});
