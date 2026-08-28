const assert = require('node:assert');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

function obs() {
  return {
    trace: { t: 'test', s: 'test' },
    log: {
      info() {},
      warn() {},
      debug() {},
      error() {},
    },
  };
}

function runtimeResponse() {
  return {
    application: 'App',
    group: 'api',
    profile: 'default',
    version: 1,
    config: {
      default: {
        services: {
          api: { plugin: 'service-api', enabled: true },
        },
      },
    },
  };
}

module.exports = async ({ pluginRoot }) => {
  const mod = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/config-vault-google/index.js')).href);
  const base = await import('@bsb/base');
  const schema = new mod.Config('', '', '', 'config-vault-google').validationSchema;
  const baseConfig = {
    vaultUrl: 'https://vault.example.com',
    googleAudience: 'https://vault-run-url.a.run.app',
    apiKeyId: 'vk_test',
    apiSecret: 'vs_test',
    timeoutMs: 1000,
    staleAllowedHours: 0,
    allowInsecureHttp: false,
  };

  assert.equal(schema.parse(baseConfig).googleAudience, baseConfig.googleAudience);
  assert.throws(() => schema.parse({ ...baseConfig, googleAudience: '' }));

  class TestPlugin extends mod.Plugin {
    tokens = [];
    async googleIdToken(forceRefresh) {
      const token = forceRefresh ? 'token-2' : 'token-1';
      this.tokens.push(token);
      return token;
    }
  }

  const originalFetch = globalThis.fetch;
  try {
    const headers = [];
    globalThis.fetch = async (_url, init) => {
      headers.push(init.headers);
      return new Response(JSON.stringify(runtimeResponse()), { status: 200 });
    };
    const plugin = new TestPlugin({
      appId: 'test', mode: 'development', cwd: process.cwd(), packageCwd: process.cwd(), pluginCwd: process.cwd(),
      pluginName: 'config-vault-google', pluginVersion: '0.0.0', config: baseConfig, sbObservable: {},
    });
    await plugin.init(obs());
    assert.equal(headers[0]['x-vault-key-id'], 'vk_test');
    assert.equal(headers[0]['x-vault-secret'], 'vs_test');
    assert.equal(headers[0]['X-Serverless-Authorization'], 'Bearer token-1');

    let calls = 0;
    globalThis.fetch = async (_url, init) => {
      headers.push(init.headers);
      calls += 1;
      return calls === 1
        ? new Response('denied', { status: 401 })
        : new Response(JSON.stringify(runtimeResponse()), { status: 200 });
    };
    const retryPlugin = new TestPlugin({
      appId: 'test', mode: 'development', cwd: process.cwd(), packageCwd: process.cwd(), pluginCwd: process.cwd(),
      pluginName: 'config-vault-google', pluginVersion: '0.0.0', config: baseConfig, sbObservable: {},
    });
    await retryPlugin.init(obs());
    assert.equal(calls, 2);
    assert.deepStrictEqual(retryPlugin.tokens, ['token-1', 'token-2']);

    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response(JSON.stringify(runtimeResponse()), { status: 200 });
    };
    class FailingPlugin extends mod.Plugin {
      async googleIdToken() {
        throw new base.BSBError(base.createFakeDTrace('test', 'googleIdToken'), 'Google ID token acquisition failed: {error}', { error: 'no adc' });
      }
    }
    const failingPlugin = new FailingPlugin({
      appId: 'test', mode: 'development', cwd: process.cwd(), packageCwd: process.cwd(), pluginCwd: process.cwd(),
      pluginName: 'config-vault-google', pluginVersion: '0.0.0', config: { ...baseConfig, staleAllowedHours: 168 }, sbObservable: {},
    });
    await assert.rejects(() => failingPlugin.init(obs()), /Google ID token acquisition failed/);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
};
