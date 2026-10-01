import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

function atLeast(actual, minimum) {
  const a = actual.split('.').map(Number);
  const b = minimum.split('.').map(Number);
  return a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2])));
}

test('lockfile keeps every audited CVE above its fixed version', () => {
  const floors = {
    '@grpc/grpc-js': { 1: '1.14.5' }, // CVE-2026-101915, CVE-2026-101916
    'brace-expansion': { 5: '5.0.12' }, // CVE-2026-102276, CVE-2026-102277, CVE-2026-102278
    'fast-uri': { 3: '3.1.8', 4: '4.1.5' }, // CVE-2026-86472, CVE-2026-86818
    'fastify': { 5: '5.12.5' }, // CVE-2026-92081
    'ip-address': { 10: '10.7.1' }, // CVE-2026-101911, CVE-2026-101912
    'moment': { 2: '2.31.0' }, // CVE-2026-17495
    'serialize-javascript': { 7: '7.1.2' }, // CVE-2026-97711
  };
  for (const [name, majorFloors] of Object.entries(floors)) {
    const installed = Object.entries(lock.packages).filter(([path]) => path.endsWith(`/node_modules/${name}`) || path === `node_modules/${name}`);
    assert.ok(installed.length, `${name} is missing from the lockfile`);
    for (const [path, pkg] of installed) {
      const minimum = majorFloors[Number(pkg.version.split('.')[0])];
      assert.ok(minimum && atLeast(pkg.version, minimum), `${path}@${pkg.version} is below its patched floor`);
    }
  }
  assert.equal(lock.packages['plugins/nodejs/bsb-registry'].dependencies.fastify, '^5.12.5');
});

test('Go crypto module excludes the known SSH deadlock releases', () => {
  const goMod = readFileSync(new URL('../go.mod', import.meta.url), 'utf8');
  const version = goMod.match(/^\s*golang\.org\/x\/crypto v(\d+\.\d+\.\d+)/m)?.[1];
  assert.ok(version && atLeast(version, '0.56.0'), 'GO-2026-6354 and GO-2026-6355 require x/crypto v0.56.0');
});

test('fast-uri normalizes encoded host case and reserved mailto fields', () => {
  const uri = require('fast-uri');
  assert.equal(uri.parse('//%41.com').host, 'a.com'); // CVE-2026-86472
  assert.equal(uri.equal('//%41.com', '//a.com'), true);
  const parsed = uri.parse('mailto:alice@example.com?%74o=bob@example.com'); // CVE-2026-86818
  assert.deepEqual(parsed.to, ['alice@example.com', 'bob@example.com']);
  assert.deepEqual(uri.parse(uri.serialize(parsed)).to, parsed.to);
});

test('ip-address rejects cross-family allowlist matches and oversized diagnostics', () => {
  const { Address4, Address6, AddressError } = require('ip-address');
  assert.equal(new Address6('a00::1').isInSubnet(new Address4('10.0.0.0/8')), false); // CVE-2026-101912
  assert.equal(new Address4('32.1.13.184').isInSubnet(new Address6('2001:db8::/32')), false);
  assert.throws(() => new Address6('!'.repeat(1024 * 1024)), AddressError); // CVE-2026-101911
});

test('brace expansion bounds recursive and quadratic adversarial patterns', () => {
  const { expand } = require('brace-expansion');
  assert.doesNotThrow(() => expand('{'.repeat(3200) + 'a,b' + '}'.repeat(3200))); // CVE-2026-102278
  assert.doesNotThrow(() => expand('{' + '{a},'.repeat(7000) + 'b}')); // CVE-2026-102276
  const started = performance.now();
  assert.doesNotThrow(() => expand('{a}' + '}'.repeat(128000) + ',z}')); // CVE-2026-102277
  assert.ok(performance.now() - started < 8000, 'rewrite loop must remain bounded');
});

test('serialize-javascript cannot turn function source into an active closing script tag', () => {
  const serialize = require('serialize-javascript');
  const source = "function f(x){ return x</script=+/ + '</script><img src=x onerror=alert(1)>' }";
  const output = serialize({ h: new Function(`return ${source}`)() }); // CVE-2026-97711
  assert.doesNotMatch(output, /<\/script(?:[\s/>])/i);
});

test('moment does not load a path supplied as a locale object', () => {
  const moment = require('moment');
  const attempted = [];
  const originalLoad = Module._load;
  Module._load = function (request, ...args) {
    if (request.startsWith('./locale/..')) attempted.push(request);
    return originalLoad.call(this, request, ...args);
  };
  try {
    moment.localeData({
      match: () => true,
      toLowerCase: () => '../moment',
      toString: () => '../moment',
    }); // CVE-2026-17495
  } finally {
    Module._load = originalLoad;
  }
  assert.deepEqual(attempted, []);
});

test('gRPC does not return thrown handler secrets to clients', async () => {
  const grpc = require('@grpc/grpc-js');
  const service = { Test: {
    path: '/security.Test/Test', requestStream: false, responseStream: false,
    requestSerialize: value => Buffer.from(JSON.stringify(value)),
    requestDeserialize: value => JSON.parse(value),
    responseSerialize: value => Buffer.from(JSON.stringify(value)),
    responseDeserialize: value => JSON.parse(value),
  } };
  const server = new grpc.Server();
  server.addService(service, { Test: () => { throw new Error('SECRET-DO-NOT-LEAK'); } }); // CVE-2026-101915
  const port = await new Promise((resolve, reject) => server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error, boundPort) => error ? reject(error) : resolve(boundPort)));
  const Client = grpc.makeGenericClientConstructor(service, 'Test');
  const client = new Client(`127.0.0.1:${port}`, grpc.credentials.createInsecure());
  try {
    const error = await new Promise(resolve => client.Test({}, resolve));
    assert.ok(error);
    assert.doesNotMatch(error.details, /SECRET-DO-NOT-LEAK/);
  } finally {
    client.close();
    await new Promise(resolve => server.tryShutdown(resolve));
  }
});

test('Fastify HTTP/2 response trailers do not crash the server', () => {
  const source = `
    import Fastify from 'fastify';
    import http2 from 'node:http2';
    const app = Fastify({ http2: true });
    app.get('/', async (_request, reply) => {
      reply.trailer('x-checksum', async () => 'abc');
      return 'hello';
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const client = http2.connect('http://127.0.0.1:' + app.server.address().port);
    const request = client.request({ ':method': 'GET', ':path': '/' });
    let status;
    request.on('response', headers => { status = headers[':status']; });
    request.on('data', () => {});
    request.end();
    await new Promise((resolve, reject) => { request.on('end', resolve); request.on('error', reject); });
    if (status !== 200) process.exitCode = 1;
    client.close();
    await app.close();
  `; // CVE-2026-92081
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--input-type=module', '-e', source], { timeout: 5000 }));
});
