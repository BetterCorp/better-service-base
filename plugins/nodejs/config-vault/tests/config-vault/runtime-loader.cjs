const assert = require('node:assert');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const os = require('node:os');
const { mkdtemp, rm } = require('node:fs/promises');

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

module.exports = async ({ pluginRoot }) => {
  const mod = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/config-vault/index.js')).href);
  const schema = new mod.Config('', '', '', 'config-vault').validationSchema;
  const baseConfig = {
    vaultUrl: 'https://vault.example.com',
    apiKeyId: 'vk_test',
    apiSecret: 'vs_test',
  };
  assert.deepStrictEqual(schema.parse({
    ...baseConfig,
    timeoutMs: '5000',
    staleAllowedHours: '24',
    allowInsecureHttp: 'false',
  }), {
    ...baseConfig,
    timeoutMs: 5000,
    staleAllowedHours: 24,
    allowInsecureHttp: false,
  });
  assert.throws(() => schema.parse({ ...baseConfig, timeoutMs: '999' }));
  assert.throws(() => schema.parse({ ...baseConfig, staleAllowedHours: '-1' }));
  assert.throws(() => schema.parse({ ...baseConfig, allowInsecureHttp: 'yes' }));

  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'bsb-vault-cache-'));
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      application: 'BetterPortal',
      group: 'api',
      profile: 'production',
      version: 7,
      config: {
        production: {
          observable: {
            logs: {
              plugin: 'observable-default',
              enabled: true,
            },
            'observable-axiom': {
              plugin: 'observable-axiom',
              package: '@bsb/observable-axiom',
              enabled: true,
              config: {
                axiom: {
                  token: 'xaat-test',
                  dataset: 'betterportal',
                },
              },
            },
          },
          events: {
            bus: {
              plugin: 'events-default',
              enabled: true,
              filter: ['api'],
            },
          },
          services: {
            api: {
              plugin: 'service-api',
              package: '@example/api',
              version: '1.0.0',
              enabled: true,
              config: { port: 3000 },
            },
          },
        },
      },
    }), { status: 200 });

    const plugin = new mod.Plugin({
      appId: 'test',
      mode: 'development',
      cwd,
      packageCwd: process.cwd(),
      pluginCwd: process.cwd(),
      pluginName: 'config-vault',
      pluginVersion: '0.0.0',
      config: {
        vaultUrl: 'https://vault.example.com',
        apiKeyId: 'vk_test',
        apiSecret: 'vs_test',
        timeoutMs: 1000,
        staleAllowedHours: 168,
        allowInsecureHttp: false,
      },
      sbObservable: {},
    });

    const testObs = obs();
    await plugin.init(testObs);
    assert.deepStrictEqual(await plugin.getObservablePlugins(testObs), {
      logs: {
        enabled: true,
        filter: undefined,
        package: undefined,
        plugin: 'observable-default',
        version: undefined,
      },
      'observable-axiom': {
        enabled: true,
        filter: undefined,
        package: '@bsb/observable-axiom',
        plugin: 'observable-axiom',
        version: undefined,
      },
    });
    assert.deepStrictEqual(await plugin.getEventsPlugins(testObs), {
      bus: {
        enabled: true,
        filter: ['api'],
        package: undefined,
        plugin: 'events-default',
        version: undefined,
      },
    });
    assert.deepStrictEqual(await plugin.getServicePlugins(testObs), {
      api: {
        enabled: true,
        filter: undefined,
        package: '@example/api',
        plugin: 'service-api',
        version: '1.0.0',
      },
    });
    assert.deepStrictEqual(await plugin.getPluginConfig(testObs, 'service', 'api'), { port: 3000 });
    assert.deepStrictEqual(await plugin.getPluginConfig(testObs, 'observable', 'observable-axiom'), {
      axiom: {
        token: 'xaat-test',
        dataset: 'betterportal',
      },
    });

    globalThis.fetch = async () => { throw new Error('vault offline'); };
    let clockReads = 0;
    Date.now = () => originalNow() + (clockReads++ === 0 ? 0 : 16_000);
    const cachedPlugin = new mod.Plugin({
      appId: 'test', mode: 'development', cwd, packageCwd: cwd, pluginCwd: cwd,
      pluginName: 'config-vault', pluginVersion: '0.0.0', sbObservable: {},
      config: { vaultUrl: 'https://vault.example.com', apiKeyId: 'vk_test', apiSecret: 'vs_test', timeoutMs: 1000, staleAllowedHours: 168, allowInsecureHttp: false },
    });
    await cachedPlugin.init(testObs);
    assert.deepStrictEqual(await cachedPlugin.getPluginConfig(testObs, 'service', 'api'), { port: 3000 });

    Date.now = originalNow;
    globalThis.fetch = async () => new Response('denied', { status: 401 });
    const deniedPlugin = new mod.Plugin({
      appId: 'test', mode: 'development', cwd, packageCwd: cwd, pluginCwd: cwd,
      pluginName: 'config-vault', pluginVersion: '0.0.0', sbObservable: {},
      config: { vaultUrl: 'https://vault.example.com', apiKeyId: 'vk_test', apiSecret: 'vs_test', timeoutMs: 1000, staleAllowedHours: 168, allowInsecureHttp: false },
    });
    await assert.rejects(() => deniedPlugin.init(testObs), /HTTP 401/);
    globalThis.fetch = async () => new Response('internal error', { status: 500 });
    await assert.rejects(() => deniedPlugin.init(testObs), /HTTP 500/);
    globalThis.fetch = async () => new Response('', { status: 302, headers: { location: 'https://login.example.com' } });
    await assert.rejects(() => deniedPlugin.init(testObs), /redirect/i);
    globalThis.fetch = async () => new Response('not-json', { status: 200 });
    await assert.rejects(() => deniedPlugin.init(testObs), /expected JSON/);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
    await rm(cwd, { recursive: true, force: true });
  }
};
