import * as assert from 'node:assert';
import type { Observable } from '@bsb/base';
import { Plugin as VaultConfigPlugin } from '../plugins/config-vault/index.js';
import { decryptJson, encryptJson, generateTotp, hashSecret, loadMasterKey, verifySecret, verifyTotp } from '../plugins/service-config-vault/crypto.js';

function obs(): Observable {
  return {
    trace: { t: 'test', s: 'test' },
    log: {
      info() { },
      warn() { },
      debug() { },
      error() { },
    },
  } as unknown as Observable;
}

function createPlugin(vaultUrl = 'https://vault.example.com') {
  return new VaultConfigPlugin({
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
  } as ConstructorParameters<typeof VaultConfigPlugin>[0]);
}

describe('Vault crypto', () => {
  it('encrypts payloads without storing plaintext', () => {
    const key = loadMasterKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    const payload = { default: { services: { api: { plugin: 'service-api', enabled: true } } } };
    const encrypted = encryptJson(payload, key);

    assert.equal(encrypted.encryptedPayload.includes('service-api'), false);
    assert.deepStrictEqual(decryptJson(encrypted, key), payload);
  });

  it('hashes and verifies secrets', async () => {
    const hash = await hashSecret('correct horse battery staple');
    assert.equal(await verifySecret('correct horse battery staple', hash), true);
    assert.equal(await verifySecret('wrong', hash), false);
  });

  it('generates and verifies TOTP codes', () => {
    const secret = 'AAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const code = generateTotp(secret, 1234);
    assert.equal(verifyTotp(secret, code, 1234 * 30000), true);
    assert.equal(verifyTotp(secret, '123456', 1234 * 30000), false);
  });
});

describe('config-vault plugin', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('loads latest active config from Vault', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({
      application: 'BetterPortal',
      group: 'api',
      profile: 'production',
      version: 7,
      config: {
        production: {
          observable: {
            logs: { plugin: 'observable-default', enabled: true },
          },
          events: {
            bus: { plugin: 'events-default', enabled: true, filter: ['api'] },
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

    const plugin = createPlugin();
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
  });

  it('rejects insecure Vault URLs unless explicitly allowed', async () => {
    const plugin = createPlugin('http://vault.local');
    await assert.rejects(() => plugin.init(obs()), /requires https/i);
  });

  it('fails when Vault returns no enabled services', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({
      application: 'App',
      group: 'api',
      profile: 'default',
      version: 1,
      config: { default: { services: {} } },
    }), { status: 200 });

    await assert.rejects(() => createPlugin().init(obs()), /at least one service/i);
  });
});
