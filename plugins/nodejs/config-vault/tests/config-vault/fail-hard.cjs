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

function plugin(Ctor, vaultUrl = 'https://vault.example.com') {
  return new Ctor({
    appId: 'test',
    mode: 'development',
    cwd: process.cwd(),
    packageCwd: process.cwd(),
    pluginCwd: process.cwd(),
    pluginName: 'config-vault',
    pluginVersion: '0.0.0',
    config: {
      vaultUrl,
      apiKeyId: 'vk_test',
      apiSecret: 'vs_test',
      timeoutMs: 1000,
      allowInsecureHttp: false,
    },
    sbObservable: {},
  });
}

module.exports = async ({ pluginRoot }) => {
  const mod = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/config-vault/index.js')).href);
  const originalFetch = globalThis.fetch;
  try {
    await assert.rejects(() => plugin(mod.Plugin, 'http://vault.local').init(obs()), /requires https/i);

    globalThis.fetch = async () => new Response(JSON.stringify({
      application: 'App',
      group: 'api',
      profile: 'default',
      version: 1,
      config: { default: { services: {} } },
    }), { status: 200 });

    await assert.rejects(() => plugin(mod.Plugin).init(obs()), /at least one service/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
};
