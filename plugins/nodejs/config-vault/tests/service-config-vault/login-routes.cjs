const assert = require('node:assert');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const net = require('node:net');

module.exports = async ({ pluginRoot }) => {
  const { VaultHttpServer } = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/http-server.js')).href);
  const port = await freePort();
  const calls = [];
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
          applications: [{ id: 'app-1', name: 'App', description: 'Main app' }],
          groups: [{ id: 'group-1', applicationId: 'app-1', name: 'api' }],
          profiles: [{ id: 'profile-1', groupId: 'group-1', name: 'default', activeVersionId: null }],
          plugins: [],
          runtimeKeys: [],
        };
      },
      async updateApplication(userId, id, name, description) {
        calls.push(['updateApplication', userId, id, name, description]);
      },
      async deleteApplication(userId, id) {
        calls.push(['deleteApplication', userId, id]);
      },
      async updateGroup(userId, id, applicationId, name) {
        calls.push(['updateGroup', userId, id, applicationId, name]);
      },
      async deleteGroup(userId, id) {
        calls.push(['deleteGroup', userId, id]);
      },
      async updateProfile(userId, id, groupId, name) {
        calls.push(['updateProfile', userId, id, groupId, name]);
      },
      async deleteProfile(userId, id) {
        calls.push(['deleteProfile', userId, id]);
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

    const applications = await fetch(`http://127.0.0.1:${port}/applications`, {
      headers: { cookie: 'vault_session=session; vault_csrf=csrf-token' },
    });
    const applicationsHtml = await applications.text();
    assert.match(applicationsHtml, /\/api\/applications\/update/);
    assert.match(applicationsHtml, /\/api\/applications\/delete/);

    const deployments = await fetch(`http://127.0.0.1:${port}/deployments`, {
      headers: { cookie: 'vault_session=session; vault_csrf=csrf-token' },
    });
    const deploymentsHtml = await deployments.text();
    assert.match(deploymentsHtml, /\/api\/groups\/update/);
    assert.match(deploymentsHtml, /\/api\/groups\/delete/);
    assert.match(deploymentsHtml, /\/api\/profiles\/update/);
    assert.match(deploymentsHtml, /\/api\/profiles\/delete/);

    await postJson(port, '/api/applications/update', { id: 'app-1', name: 'App 2', description: 'Updated' });
    await postJson(port, '/api/applications/delete', { id: 'app-1' });
    await postJson(port, '/api/groups/update', { id: 'group-1', applicationId: 'app-1', name: 'worker' });
    await postJson(port, '/api/groups/delete', { id: 'group-1' });
    await postJson(port, '/api/profiles/update', { id: 'profile-1', groupId: 'group-1', name: 'prod' });
    await postJson(port, '/api/profiles/delete', { id: 'profile-1' });
    assert.deepEqual(calls, [
      ['updateApplication', 'user-1', 'app-1', 'App 2', 'Updated'],
      ['deleteApplication', 'user-1', 'app-1'],
      ['updateGroup', 'user-1', 'group-1', 'app-1', 'worker'],
      ['deleteGroup', 'user-1', 'group-1'],
      ['updateProfile', 'user-1', 'profile-1', 'group-1', 'prod'],
      ['deleteProfile', 'user-1', 'profile-1'],
    ]);
  } finally {
    await server.stop();
  }
};

async function postJson(port, pathname, body) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'vault_session=session; vault_csrf=csrf-token',
      'x-csrf-token': 'csrf-token',
    },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 200);
}

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
