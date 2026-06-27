const assert = require('node:assert');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const net = require('node:net');

module.exports = async ({ pluginRoot }) => {
  const { VaultHttpServer } = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/http-server.js')).href);
  const port = await freePort();
  const server = new VaultHttpServer({
    host: '127.0.0.1',
    port,
    publicUrl: `http://127.0.0.1:${port}`,
    production: false,
    obs: { log: { info() {}, debug() {}, warn() {}, error() {} } },
    vault: {
      async setupRequired() {
        return false;
      },
      async requireSession() {
        return { userId: 'user-1', csrfToken: 'csrf-token' };
      },
      async login() {
        return { status: 'passkey_setup_required', setupToken: 'setup-token' };
      },
      async dashboard() {
        return {
          setupRequired: false,
          applications: [],
          groups: [],
          profiles: [],
          plugins: [],
          runtimeKeys: [],
        };
      },
      async userProfile() {
        return {
          user: { id: 'user-1', email: 'admin@example.com', createdAt: '2026-01-01T00:00:00.000Z' },
          passkeys: [{ credentialId: 'credential-1234567890', createdAt: '2026-01-02T00:00:00.000Z' }],
        };
      },
    },
  });

  try {
    await server.start();
    const response = await fetch(`http://127.0.0.1:${port}/login/start`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'password', totpCode: '123456' }),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie') ?? '', /vault_passkey_setup=/);
    assert.deepEqual(await response.json(), { status: 'passkey_setup_required', redirect: '/passkeys/setup' });

    const profile = await fetch(`http://127.0.0.1:${port}/profile`, {
      headers: { cookie: 'vault_session=session; vault_csrf=csrf-token' },
    });
    const profileHtml = await profile.text();
    assert.equal(profile.status, 200);
    assert.match(profileHtml, /Passkey Accounts/);
    assert.match(profileHtml, /credential\.\.\.567890/);

    const overview = await fetch(`http://127.0.0.1:${port}/`, {
      headers: { cookie: 'vault_session=session; vault_csrf=csrf-token' },
    });
    const overviewHtml = await overview.text();
    assert.equal(overview.status, 200);
    assert.doesNotMatch(overviewHtml, /Use the JSON API/);
  } finally {
    await server.stop();
  }
};

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === 'string') {
          reject(new Error('Could not allocate test port'));
          return;
        }
        resolve(address.port);
      });
    });
  });
}
