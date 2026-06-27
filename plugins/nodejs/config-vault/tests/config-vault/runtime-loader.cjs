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

module.exports = async ({ pluginRoot }) => {
  const mod = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/config-vault/index.js')).href);
  const originalFetch = globalThis.fetch;
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
      cwd: process.cwd(),
      packageCwd: process.cwd(),
      pluginCwd: process.cwd(),
      pluginName: 'config-vault',
      pluginVersion: '0.0.0',
      config: {
        vaultUrl: 'https://vault.example.com',
        apiKeyId: 'vk_test',
        apiSecret: 'vs_test',
        timeoutMs: 1000,
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
  } finally {
    globalThis.fetch = originalFetch;
  }
};
