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
      async createDeployment(userId, applicationId, name) {
        calls.push(['createDeployment', userId, applicationId, name]);
        return {
          group: { id: 'group-2', applicationId, name },
          profile: { id: 'profile-2', groupId: 'group-2', name: 'default' },
        };
      },
      async updateProfile(userId, id, groupId, name) {
        calls.push(['updateProfile', userId, id, groupId, name]);
      },
      async deleteProfile(userId, id) {
        calls.push(['deleteProfile', userId, id]);
      },
      async deploymentProfile(profileId) {
        assert.equal(profileId, 'profile-1');
        return {
          application: { id: 'app-1', name: 'App', description: 'Main app' },
          group: { id: 'group-1', applicationId: 'app-1', name: 'api' },
          profile: { id: 'profile-1', groupId: 'group-1', name: 'default', activeVersionId: null },
          profiles: [{ id: 'profile-1', groupId: 'group-1', name: 'default', activeVersionId: null }],
          plugins: [{
            id: 'plugin-1',
            org: '@bsb',
            name: 'service-api',
            pluginId: 'service-api',
            packageName: '@bsb/service-api',
            version: '1.0.0',
            kind: 'service',
            source: 'manual',
            configSchema: {
              root: {
                kind: 'object',
                properties: {
                  host: { kind: 'string', metadata: { description: 'HTTP host' } },
                  port: { kind: 'int32', metadata: { description: 'HTTP port' } },
                  enabled: { kind: 'bool', metadata: { description: 'Feature enabled' } },
                  tags: { kind: 'array', items: { kind: 'string' }, metadata: { description: 'Tags' } },
                  headers: { kind: 'record', valueSchema: { kind: 'string' }, metadata: { description: 'Headers' } },
                  bind: { kind: 'tuple', items: [{ kind: 'string' }, { kind: 'int32' }], metadata: { description: 'Bind Address' } },
                },
              },
            },
            eventSchema: null,
          }],
          draft: { observable: {}, events: {}, services: { api: { plugin: 'service-api', enabled: true } } },
          runtimeKeys: [{ id: 'vk_old', name: 'api-default', profileId: 'profile-1', groupId: 'group-1', applicationId: 'app-1', containerName: null, revokedAt: null }],
        };
      },
      async saveProfileDraft(userId, profileId, config) {
        calls.push(['saveProfileDraft', userId, profileId, config]);
      },
      async createProfileRuntimeKey(userId, input) {
        calls.push(['createProfileRuntimeKey', userId, input.profileId, input.name, input.containerName]);
        return { keyId: 'vk_new', secret: 'vs_new' };
      },
      async upsertProfilePlugin(userId, input) {
        calls.push(['upsertProfilePlugin', userId, input.profileId, input.section, input.name, input.plugin, input.config]);
      },
      async removeProfilePlugin(userId, input) {
        calls.push(['removeProfilePlugin', userId, input.profileId, input.section, input.name]);
      },
      async rotateProfileRuntimeKey(userId, input) {
        calls.push(['rotateProfileRuntimeKey', userId, input.keyId]);
        return { keyId: 'vk_rotated', secret: 'vs_rotated' };
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
    assert.doesNotMatch(deploymentsHtml, /Create Service Group/);
    assert.match(deploymentsHtml, /Create Deployment/);

    const deployment = await fetch(`http://127.0.0.1:${port}/deployment?profileId=profile-1`, {
      headers: { cookie: 'vault_session=session; vault_csrf=csrf-token' },
    });
    const deploymentHtml = await deployment.text();
    assert.equal(deployment.status, 200);
    assert.match(deploymentHtml, /Profile Config/);
    assert.doesNotMatch(deploymentHtml, /Config JSON/);
    assert.doesNotMatch(deploymentHtml, /\{"default":/);
    assert.match(deploymentHtml, /Add Plugin/);
    assert.match(deploymentHtml, /data-config-path="host"/);
    assert.match(deploymentHtml, /HTTP port/);
    assert.match(deploymentHtml, /data-array-path="tags"/);
    assert.match(deploymentHtml, /data-record-path="headers"/);
    assert.match(deploymentHtml, /data-tuple-path="bind"/);
    assert.match(deploymentHtml, /\/api\/runtime-keys\/rotate/);

    const runtimeKeys = await fetch(`http://127.0.0.1:${port}/runtime-keys?keyId=vk_test&secret=vs_test`, {
      headers: { cookie: 'vault_session=session; vault_csrf=csrf-token' },
    });
    const runtimeKeysHtml = await runtimeKeys.text();
    assert.equal(runtimeKeys.status, 200);
    assert.match(runtimeKeysHtml, /BSB_CONFIG_PLUGIN=config-vault/);
    assert.match(runtimeKeysHtml, /BSB_CONFIG_PLUGIN_PACKAGE=@bsb\/config-vault/);
    assert.match(runtimeKeysHtml, /vaultUrl=http:\/\/127\.0\.0\.1:/);
    assert.match(runtimeKeysHtml, /apiKeyId=vk_test/);
    assert.match(runtimeKeysHtml, /apiSecret=vs_test/);

    await postJson(port, '/api/groups', { applicationId: 'app-1', name: 'worker' });
    await postJson(port, '/api/drafts', { profileId: 'profile-1', config: { services: { api: { plugin: 'service-api', enabled: true } } } });
    await postJson(port, '/api/profile-plugins', { profileId: 'profile-1', section: 'services', name: 'api', plugin: 'service-api', enabled: true, config: { host: '0.0.0.0', port: 3200 } });
    await postJson(port, '/api/profile-plugins/delete', { profileId: 'profile-1', section: 'services', name: 'api' });
    await postJson(port, '/api/runtime-keys', { profileId: 'profile-1', name: 'api-default', containerName: 'api-1' });
    await postJson(port, '/api/runtime-keys/rotate', { keyId: 'vk_old' });
    await postJson(port, '/api/applications/update', { id: 'app-1', name: 'App 2', description: 'Updated' });
    await postJson(port, '/api/applications/delete', { id: 'app-1' });
    await postJson(port, '/api/groups/update', { id: 'group-1', applicationId: 'app-1', name: 'worker' });
    await postJson(port, '/api/groups/delete', { id: 'group-1' });
    await postJson(port, '/api/profiles/update', { id: 'profile-1', groupId: 'group-1', name: 'prod' });
    await postJson(port, '/api/profiles/delete', { id: 'profile-1' });
    assert.deepEqual(calls, [
      ['createDeployment', 'user-1', 'app-1', 'worker'],
      ['saveProfileDraft', 'user-1', 'profile-1', { services: { api: { plugin: 'service-api', enabled: true } } }],
      ['upsertProfilePlugin', 'user-1', 'profile-1', 'services', 'api', 'service-api', { host: '0.0.0.0', port: 3200 }],
      ['removeProfilePlugin', 'user-1', 'profile-1', 'services', 'api'],
      ['createProfileRuntimeKey', 'user-1', 'profile-1', 'api-default', 'api-1'],
      ['rotateProfileRuntimeKey', 'user-1', 'vk_old'],
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
