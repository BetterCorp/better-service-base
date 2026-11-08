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

test('localhost is normalized to a numeric loopback bind', async () => {
  const server = new TodoHttpServer(
    { port: 0, host: 'localhost', cors: false },
    process.cwd(),
    async () => ({ status: 200, data: {} }),
  );
  const obs = { log: { info() {}, error() {} } } as never;
  try {
    await server.start(obs, (() => undefined) as never);
    const address = (server as unknown as { server: { addresses(): Array<{ address: string }> } })
      .server.addresses()[0]?.address;
    assert.equal(address, '127.0.0.1');
  } finally {
    await server.stop();
  }
});
