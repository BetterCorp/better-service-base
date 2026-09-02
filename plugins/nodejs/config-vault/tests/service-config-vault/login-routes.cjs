const assert = require('node:assert');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { createHash } = require('node:crypto');

module.exports = async ({ pluginRoot }) => {
  const { VaultHttpServer } = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/http-server.js')).href);
  const port = await freePort();
  const registryPort = await freePort();
  const registryAuthorization = [];
  const registryServer = http.createServer((req, res) => {
    if (!req.url.startsWith('/plugins')) {
      res.writeHead(404).end();
      return;
    }
    registryAuthorization.push(req.headers.authorization);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      plugins: [{
        org: '@bsb',
        name: 'service-api',
        pluginId: 'service-api',
        packageName: '@bsb/service-api',
        version: '1.0.0',
        kind: 'service',
        configSchema: { root: { kind: 'object', properties: { host: { kind: 'string' } } } },
      }, {
        org: '@bsb',
        name: 'service-worker',
        pluginId: 'service-worker',
        packageName: '@bsb/service-worker',
        version: '1.0.0',
        kind: 'service',
        configSchema: { root: { kind: 'object', properties: {} } },
      }, {
        org: 'betterportal',
        name: 'service-betterportal-theme-bootstrap1',
        pluginId: 'betterportal/service-betterportal-theme-bootstrap1',
        package: { nodejs: '@betterportal/theme-bootstrap1' },
        version: '10.0.9',
        category: 'service',
        configSchema: { root: { kind: 'object', properties: {} } },
      }],
    }));
  });
  await new Promise((resolve) => registryServer.listen(registryPort, '127.0.0.1', resolve));
  const calls = [];
  const runtimeTraceIds = [];
  const spans = [];
  const logs = [];
  const createTrace = (name, attributes = {}) => {
    const span = {
      name,
      attributes,
      trace: { t: `trace-${spans.length + 1}`, s: `span-${spans.length + 1}` },
      ended: false,
      endAttributes: null,
      errors: [],
    };
    spans.push(span);
    return {
      trace: span.trace,
      traceId: span.trace.t,
      spanId: span.trace.s,
      attributes,
      resource: {},
      log: {
        info(message, meta) { logs.push({ level: 'info', trace: span.trace, message, meta }); },
        debug(message, meta) { logs.push({ level: 'debug', trace: span.trace, message, meta }); },
        warn(message, meta) { logs.push({ level: 'warn', trace: span.trace, message, meta }); },
        error(message, meta) { logs.push({ level: 'error', trace: span.trace, message, meta }); },
      },
      metrics: {},
      startSpan(childName, childAttributes = {}) { return createTrace(childName, { ...attributes, ...childAttributes }); },
      setAttribute(key, value) { return createTrace(name, { ...attributes, [key]: value }); },
      setAttributes(nextAttributes) { return createTrace(name, { ...attributes, ...nextAttributes }); },
      error(error, errorAttributes) { span.errors.push({ error, attributes: errorAttributes }); },
      end(endAttributes) {
        span.ended = true;
        span.endAttributes = endAttributes;
      },
    };
  };
  const server = new VaultHttpServer({
    host: '127.0.0.1',
    port,
    version: '9.9.9',
    publicUrl: `http://127.0.0.1:${port}`,
    registryUrl: `http://127.0.0.1:${registryPort}`,
    registryToken: 'vault-registry-token',
    production: false,
    obs: createTrace('test-root'),
    createTrace,
    vault: {
      async assertAuditWritable() {},
      async auditMutationIntent() { return 'mutation-1'; },
      async setupRequired() {
        return false;
      },
      async requireSession(sessionId) {
        if (sessionId !== 'session') throw new Error('Authentication required');
        return { userId: 'user-1', csrfToken: createHash('sha256').update('csrf-token').digest('base64url') };
      },
      async login() {
        return { status: 'passkey_setup_required', setupToken: 'setup-token' };
      },
      async consumePasskeySetupToken(token) {
        assert.equal(token, 'setup-token');
        return 'user-1';
      },
      async startPasskeyRegistration(userId) {
        assert.equal(userId, 'user-1');
        return { challenge: 'registration-challenge' };
      },
      async dashboard() {
        return {
          setupRequired: false,
          applications: [{ id: 'app-1', name: 'App', description: 'Main app' }],
          groups: [{ id: 'group-1', applicationId: 'app-1', name: 'api' }],
          profiles: [{ id: 'profile-1', groupId: 'group-1', name: 'default', activeVersionId: null }],
          plugins: [{
            id: 'service-plugin',
            org: '@bsb',
            name: 'service-api',
            pluginId: 'service-api',
            packageName: '@bsb/service-api',
            version: '1.0.0',
            kind: 'service',
            source: 'manual',
          }, {
            id: 'service-plugin-upload',
            org: '@bsb',
            name: 'service-api',
            pluginId: 'service-api',
            packageName: '@bsb/service-api',
            version: '1.1.0',
            kind: 'service',
            source: 'upload',
          }, {
            id: 'root-plugin',
            org: '_',
            name: 'syslog-client',
            pluginId: 'syslog-client',
            packageName: '@bsb/syslog-client',
            version: '1.0.0',
            kind: 'service',
            source: 'manual',
          }, {
            id: 'bp-theme-old',
            org: 'betterportal',
            name: 'service-betterportal-theme-bootstrap1',
            pluginId: 'service-betterportal-theme-bootstrap1',
            packageName: '@betterportal/theme-bootstrap1',
            version: '10.0.8',
            kind: 'service',
            source: 'registry',
          }, {
            id: 'config-plugin',
            org: '@bsb',
            name: 'config-vault',
            pluginId: 'config-vault',
            packageName: '@bsb/config-vault',
            version: '1.0.0',
            kind: 'config',
            source: 'manual',
          }],
          pluginUsage: {
            'service-plugin': { count: 1, locations: ['draft:profile-1/services/api'] },
            'root-plugin': { count: 0, locations: [] },
          },
          pluginPublishers: [{
            pluginId: 'service-api',
            org: '@bsb',
            name: 'service-api',
            packageName: '@bsb/service-api',
            kind: 'service',
            tokenId: 'pub-service-api',
            createdAt: '2026-01-01T00:00:00.000Z',
            rotatedAt: '2026-01-01T00:00:00.000Z',
          }],
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
      async createPlugin(userId, input) {
        calls.push(['createPlugin', userId, input.pluginId, input.version, input.packageName]);
        return { id: 'imported-plugin', createdAt: '2026-01-01T00:00:00.000Z', ...input };
      },
      async createPrivatePlugin(userId, input) {
        calls.push(['createPrivatePlugin', userId, input.schemaFileName ?? input.manifestFileName]);
        throw new Error('Schema version is required');
      },
      async publishPrivatePlugin(token, input) {
        calls.push(['publishPrivatePlugin', token, input.name, input.version]);
        return { status: 'published', plugin: { version: input.version } };
      },
      async deletePlugin(userId, id) {
        calls.push(['deletePlugin', userId, id]);
      },
      async cleanupUnusedImportedPlugins(userId) {
        calls.push(['cleanupUnusedImportedPlugins', userId]);
        return 1;
      },
      async cleanupUnusedPlugins(userId) {
        calls.push(['cleanupUnusedPlugins', userId]);
        return 2;
      },
      async resolveRuntimeConfig(_keyId, _secret, obs) {
        runtimeTraceIds.push(obs.trace.t);
        throw new Error('database exploded');
      },
      async deploymentProfile(profileId) {
        assert.equal(profileId, 'profile-1');
        const pluginCatalog = [{
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
                port: { kind: 'int32', default: 3200, metadata: { description: 'HTTP port' } },
                enabled: { kind: 'bool', metadata: { description: 'Feature enabled' } },
                token: { kind: 'optional', inner: { kind: 'string' }, metadata: { description: 'Optional token' } },
                tags: { kind: 'array', items: { kind: 'string' }, metadata: { description: 'Tags' } },
                headers: { kind: 'record', valueSchema: { kind: 'string' }, metadata: { description: 'Headers' } },
                bind: { kind: 'tuple', items: [{ kind: 'string' }, { kind: 'int32' }], metadata: { description: 'Bind Address' } },
                mode: { kind: 'enum', values: ['file', 'postgres'], default: 'file', metadata: { description: 'Storage mode' } },
                storage: {
                  kind: 'union',
                  variants: [{
                    kind: 'object',
                    properties: {
                      backend: { kind: 'literal', value: 'file' },
                      configPath: { kind: 'string', minLength: 1 },
                    },
                    required: ['backend', 'configPath'],
                  }, {
                    kind: 'object',
                    properties: {
                      backend: { kind: 'literal', value: 'postgres' },
                      connectionString: { kind: 'string', minLength: 1 },
                    },
                    required: ['backend', 'connectionString'],
                  }],
                  default: { backend: 'file', configPath: './config.yaml' },
                },
              },
            },
          },
          eventSchema: null,
        }, {
          id: 'plugin-root',
          org: '_',
          name: 'syslog-client',
          pluginId: 'syslog-client',
          packageName: '@bsb/syslog-client',
          version: '1.0.0',
          kind: 'service',
          source: 'manual',
          configSchema: null,
          eventSchema: null,
        }, {
          id: 'plugin-config',
          org: '@bsb',
          name: 'config-vault',
          pluginId: 'config-vault',
          packageName: '@bsb/config-vault',
          version: '1.0.0',
          kind: 'config',
          source: 'manual',
          configSchema: null,
          eventSchema: null,
        }];
        return {
          application: { id: 'app-1', name: 'App', description: 'Main app' },
          group: { id: 'group-1', applicationId: 'app-1', name: 'api' },
          profile: { id: 'profile-1', groupId: 'group-1', name: 'default', activeVersionId: null },
          profiles: [{ id: 'profile-1', groupId: 'group-1', name: 'default', activeVersionId: null }],
          allProfiles: [
            { id: 'profile-1', groupId: 'group-1', name: 'default', activeVersionId: null },
            { id: 'profile-2', groupId: 'group-2', name: 'staging', activeVersionId: null },
          ],
          groups: [
            { id: 'group-1', applicationId: 'app-1', name: 'api' },
            { id: 'group-2', applicationId: 'app-1', name: 'worker' },
          ],
          applications: [{ id: 'app-1', name: 'App', description: 'Main app' }],
          applicationProfiles: [{ id: 'app-profile-1', applicationId: 'app-1', name: 'default', activeVersionId: null }],
          plugins: pluginCatalog,
          draft: { observable: {}, events: {}, services: { api: { plugin: 'service-api', enabled: true, autoPinned: true }, worker: { plugin: 'service-api', enabled: false } } },
          inheritedDraft: { observable: {}, events: {}, services: { shared: { plugin: 'service-api', enabled: true, config: { host: 'shared' } } } },
          configState: { state: 'draft-only', draftUpdatedAt: '2026-01-03T00:00:00.000Z', publishedAt: null },
          inheritedConfigState: { state: 'published', draftUpdatedAt: '2026-01-02T00:00:00.000Z', publishedAt: '2026-01-02T00:00:00.000Z' },
          runtimeKeys: [{ id: 'vk_old', name: 'api-default', profileId: 'profile-1', groupId: 'group-1', applicationId: 'app-1', containerName: null, revokedAt: null }],
        };
      },
      async applicationProfile(applicationId, profileName) {
        assert.equal(applicationId, 'app-1');
        assert.equal(profileName, 'default');
        return {
          application: { id: 'app-1', name: 'App', description: 'Main app' },
          applicationProfile: { id: 'app-profile-1', applicationId: 'app-1', name: 'default', activeVersionId: null },
          applicationProfiles: [{ id: 'app-profile-1', applicationId: 'app-1', name: 'default', activeVersionId: null }],
          plugins: [{
            id: 'plugin-1',
            org: '@bsb',
            name: 'service-api',
            pluginId: 'service-api',
            packageName: '@bsb/service-api',
            version: '1.0.0',
            kind: 'service',
            source: 'manual',
            configSchema: { root: { kind: 'object', properties: { host: { kind: 'string' } } } },
            eventSchema: null,
          }],
          draft: { observable: {}, events: {}, services: { shared: { plugin: 'service-api', enabled: true, config: { host: 'shared' } } } },
          configState: { state: 'draft-pending', draftUpdatedAt: '2026-01-03T00:00:00.000Z', publishedAt: '2026-01-02T00:00:00.000Z' },
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
      async copyProfilePlugin(userId, input) {
        calls.push(['copyProfilePlugin', userId, input.sourceProfileId, input.targetProfileId, input.section, input.name, input.overwrite]);
      },
      async upsertApplicationProfilePlugin(userId, input) {
        calls.push(['upsertApplicationProfilePlugin', userId, input.applicationProfileId, input.section, input.name, input.plugin, input.config]);
      },
      async removeApplicationProfilePlugin(userId, input) {
        calls.push(['removeApplicationProfilePlugin', userId, input.applicationProfileId, input.section, input.name]);
      },
      async publishApplicationProfileDraft(userId, applicationProfileId) {
        calls.push(['publishApplicationProfileDraft', userId, applicationProfileId]);
        return { versionId: 'app-version-1', version: 1 };
      },
      async rotateProfileRuntimeKey(userId, input) {
        calls.push(['rotateProfileRuntimeKey', userId, input.keyId]);
        return { keyId: 'vk_rotated', secret: 'vs_rotated' };
      },
      async userProfile() {
        return {
          user: { id: 'user-1', email: 'admin@example.com', createdAt: '2026-01-01T00:00:00.000Z' },
          authMethods: [{ id: 'method-1', label: 'Laptop', credentialId: 'credential-1234567890', createdAt: '2026-01-02T00:00:00.000Z' }],
        };
      },
    },
  });

  try {
    await server.start();
    const loginPage = await fetch(`http://127.0.0.1:${port}/login`);
    const loginHtml = await loginPage.text();
    assert.equal(loginPage.status, 200);
    assert.match(loginHtml, /id="setup-totp-form" aria-labelledby="setup-totp-heading" aria-describedby="setup-totp-help login-status"/);
    assert.match(loginHtml, /id="login-totp-form" aria-labelledby="login-totp-heading" aria-describedby="login-totp-help login-status"/);
    assert.match(loginHtml, /id="login-status" class="status" aria-live="polite"/);
    assert.doesNotMatch(loginHtml, /prompt\(/);

    const response = await fetch(`http://127.0.0.1:${port}/login/start`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'password', totpCode: '123456' }),
    });
    assert.equal(response.status, 200);
    const setupCookie = response.headers.get('set-cookie')?.match(/vault_passkey_setup=[^;]+/)?.[0] ?? '';
    assert.match(setupCookie, /vault_passkey_setup=/);
    assert.deepEqual(await response.json(), { status: 'passkey_setup_required', redirect: '/passkeys/setup' });

    const passkeySetup = await fetch(`http://127.0.0.1:${port}/passkeys/setup`, {
      headers: { cookie: setupCookie },
    });
    assert.equal(passkeySetup.status, 200);
    assert.match(await passkeySetup.text(), /Register Passkey/);

    const unrelatedUnauthorized = await fetch(`http://127.0.0.1:${port}/favicon.ico`, {
      headers: { cookie: setupCookie },
      redirect: 'manual',
    });
    assert.equal(unrelatedUnauthorized.status, 302);
    assert.doesNotMatch(unrelatedUnauthorized.headers.get('set-cookie') ?? '', /vault_passkey_setup=/);

    const passkeyOptions = await fetch(`http://127.0.0.1:${port}/api/passkeys/register/options`, {
      method: 'POST',
      headers: { cookie: setupCookie },
    });
    assert.equal(passkeyOptions.status, 200);
    assert.deepEqual(await passkeyOptions.json(), { challenge: 'registration-challenge' });

    const unauthorizedPasskey = await fetch(`http://127.0.0.1:${port}/api/passkeys/register/options`, {
      method: 'POST',
      redirect: 'manual',
    });
    assert.equal(unauthorizedPasskey.status, 401);
    assert.match(unauthorizedPasskey.headers.get('content-type') ?? '', /application\/json/);
    assert.deepEqual(await unauthorizedPasskey.json(), {
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication required',
    });

    const profile = await fetch(`http://127.0.0.1:${port}/profile`, {
      headers: { cookie: 'vault_session=session; vault_csrf=csrf-token' },
    });
    const profileHtml = await profile.text();
    assert.equal(profile.status, 200);
    assert.match(profileHtml, /Paired Authentication Methods/);
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
    assert.match(applicationsHtml, /Deployment Group Config/);

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
    assert.match(deploymentHtml, /state-badge live">Enabled/);
    assert.match(deploymentHtml, /state-badge disabled">Disabled/);
    assert.match(deploymentHtml, /state-badge disabled">Locked/);
    assert.match(deploymentHtml, /Draft only/);
    assert.match(deploymentHtml, /Inherited Config/);
    assert.match(deploymentHtml, /Create Override/);
    assert.match(deploymentHtml, /data-inherited-override-form/);
    assert.match(deploymentHtml, /data-enabled-override-toggle/);
    assert.match(deploymentHtml, /data-override-path="host"/);
    assert.match(deploymentHtml, /name="overridePaths"/);
    assert.match(deploymentHtml, /name="baseConfig"/);
    assert.match(deploymentHtml, /These values come from the shared deployment group config/);
    assert.match(deploymentHtml, /Deployment Group Config/);
    assert.match(deploymentHtml, /Live/);
    assert.match(deploymentHtml, /\/api\/profile-plugins\/copy/);
    assert.doesNotMatch(deploymentHtml, /Config JSON/);
    assert.doesNotMatch(deploymentHtml, /\{"default":/);
    assert.match(deploymentHtml, /Add Plugin/);
    assert.match(deploymentHtml, /data-plugin-picker/);
    assert.doesNotMatch(deploymentHtml, /name="catalogId"/);
    assert.match(deploymentHtml, /data-version-lock/);
    assert.doesNotMatch(deploymentHtml, /name="lockVersion"/);
    assert.match(deploymentHtml, /Please correct the following/);
    assert.match(deploymentHtml, /list\.className = 'validation-errors'/);
    assert.doesNotMatch(deploymentHtml, /<select name="section"/);
    assert.match(deploymentHtml, /<input type="hidden" name="section"/);
    assert.match(deploymentHtml, /name="typeDisplay" disabled/);
    assert.match(deploymentHtml, />syslog-client 1\.0\.0</);
    assert.doesNotMatch(deploymentHtml, /_\/syslog-client/);
    assert.doesNotMatch(deploymentHtml, />config-vault 1\.0\.0</);
    assert.match(deploymentHtml, /data-config-path="host"/);
    assert.match(deploymentHtml, /HTTP port/);
    assert.match(deploymentHtml, /required/);
    assert.match(deploymentHtml, /default: 3200/);
    assert.match(deploymentHtml, /data-optional-field="token"/);
    assert.match(deploymentHtml, /Enable token/);
    assert.match(deploymentHtml, /Enable this field to send it; disable it to omit it/);
    assert.match(deploymentHtml, /data-array-path="tags"/);
    assert.match(deploymentHtml, /data-record-path="headers"/);
    assert.match(deploymentHtml, /data-tuple-path="bind"/);
    assert.match(deploymentHtml, /data-config-path="mode"/);
    assert.match(deploymentHtml, /data-union-path="storage"/);
    assert.match(deploymentHtml, /backend: file/);
    assert.match(deploymentHtml, /backend: postgres/);
    assert.match(deploymentHtml, /class="plugin-card"/);
    assert.match(deploymentHtml, /\/api\/runtime-keys\/rotate/);

    const appConfig = await fetch(`http://127.0.0.1:${port}/application-config?applicationId=app-1&profile=default`, {
      headers: { cookie: 'vault_session=session; vault_csrf=csrf-token' },
    });
    const appConfigHtml = await appConfig.text();
    assert.equal(appConfig.status, 200);
    assert.match(appConfigHtml, /Deployment Group Config/);
    assert.match(appConfigHtml, /<details class="plugin-card"><summary><span>Add Shared Plugin/);
    assert.doesNotMatch(appConfigHtml, /<section><h3>Add Shared Plugin/);
    assert.doesNotMatch(appConfigHtml, /name="catalogId"/);
    assert.doesNotMatch(appConfigHtml, /name="lockVersion"/);
    assert.match(appConfigHtml, /Unpublished changes/);
    assert.match(appConfigHtml, /\/api\/application-profile-plugins/);
    assert.match(appConfigHtml, /\/api\/application-profile-publish/);

    const runtimeKeys = await fetch(`http://127.0.0.1:${port}/runtime-keys?keyId=vk_test&secret=vs_test`, {
      headers: { cookie: 'vault_session=session; vault_csrf=csrf-token' },
    });
    const runtimeKeysHtml = await runtimeKeys.text();
    assert.equal(runtimeKeys.status, 200);
    assert.doesNotMatch(runtimeKeysHtml, /apiKeyId=vk_test/);
    assert.doesNotMatch(runtimeKeysHtml, /apiSecret=vs_test/);
    assert.doesNotMatch(runtimeKeys.headers.get('content-security-policy') ?? '', /unsafe-inline/);
    assert.match(runtimeKeys.headers.get('content-security-policy') ?? '', /script-src 'self' 'nonce-/);

    const pluginsPage = await fetch(`http://127.0.0.1:${port}/plugins`, {
      headers: { cookie: 'vault_session=session; vault_csrf=csrf-token' },
    });
    const pluginsHtml = await pluginsPage.text();
    assert.equal(pluginsPage.status, 200);
    for (const script of pluginsHtml.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)) new Function(script[1]);
    assert.match(pluginsHtml, /syslog-client/);
    assert.doesNotMatch(pluginsHtml, /_\/syslog-client/);
    assert.doesNotMatch(pluginsHtml, /config-vault/);
    assert.doesNotMatch(pluginsHtml, /<option value="config">config<\/option>/);
    assert.doesNotMatch(pluginsHtml, /name="source"/);
    assert.match(pluginsHtml, /Imported/);
    assert.match(pluginsHtml, /service-worker/);
    assert.match(pluginsHtml, /Not imported/);
    assert.match(pluginsHtml, /In use/);
    assert.match(pluginsHtml, /\/api\/plugins\/delete/);
    assert.match(pluginsHtml, /Sync Imported Plugins/);
    assert.match(pluginsHtml, /Clear Unused Plugins/);
    assert.match(pluginsHtml, /Publishing credentials are also removed when no versions remain/);
    assert.match(pluginsHtml, /<th>Plugin<\/th>/);
    assert.match(pluginsHtml, /Plugin Manifest JSON/);
    assert.match(pluginsHtml, /data-plugin-batch/);
    assert.match(pluginsHtml, /required multiple/);
    assert.match(pluginsHtml, /for \(const file of files\)/);
    assert.match(pluginsHtml, /file\.name \+ ': Not uploaded - '/);
    assert.match(pluginsHtml, /data-submit-on-change/);
    const catalogRows = [...pluginsHtml.matchAll(/<tr>[\s\S]*?<\/tr>/g)].map((match) => match[0]);
    const oldPrivatePluginRow = catalogRows.find((row) => row.includes('service-api') && row.includes('<td>1.0.0</td>') && row.includes('<td>manual</td>'));
    const uploadedPrivatePluginRow = catalogRows.find((row) => row.includes('service-api') && row.includes('<td>1.1.0</td>') && row.includes('<td>upload</td>'));
    assert.ok(oldPrivatePluginRow);
    assert.ok(uploadedPrivatePluginRow);
    assert.doesNotMatch(oldPrivatePluginRow, /Rotate Publish Secret/);
    assert.match(uploadedPrivatePluginRow, /Rotate Publish Secret/);
    assert.match(uploadedPrivatePluginRow, /<button class="secondary" type="button" data-file-picker="plugin-update-service-plugin-upload">Update<\/button>/);
    assert.match(uploadedPrivatePluginRow, /hidden data-submit-on-change/);
    assert.match(pluginsHtml, /\[hidden\]\{display:none!important\}/);
    assert.match(pluginsHtml, /Vault v9\.9\.9/);
    assert.match(pluginsHtml, /BetterCorp \(PTY\) Ltd/);
    assert.match(pluginsHtml, /main\{width:100%;min-width:0;padding:24px\}/);
    assert.doesNotMatch(pluginsHtml, /max-width:1180px/);
    assert.doesNotMatch(pluginsHtml, /section\{background:var\(--panel\);border:1px solid var\(--line\)/);

    const directPublish = await fetch(`http://127.0.0.1:${port}/api/plugins/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer bv_p_test' },
      body: JSON.stringify({
        org: 'example', name: 'service-private', version: '1.1.0', language: 'nodejs',
        metadata: { category: 'service' }, package: { nodejs: '@example/service-private' },
        eventSchema: { pluginName: 'service-private', version: '1.1.0', events: {} },
      }),
    });
    assert.equal(directPublish.status, 200);
    assert.equal((await directPublish.json()).status, 'published');

    const invalidPluginSchema = await fetch(`http://127.0.0.1:${port}/api/plugins`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'vault_session=session; vault_csrf=csrf-token',
        'x-csrf-token': 'csrf-token',
      },
      body: JSON.stringify({
        org: 'example',
        packageName: '@example/service-private',
        schemaFileName: 'service-private.json',
        schema: {},
      }),
    });
    assert.equal(invalidPluginSchema.status, 400);
    assert.match((await invalidPluginSchema.json()).message, /not a valid plugin upload: Schema version is required/);

    const manifestPluginUpload = await fetch(`http://127.0.0.1:${port}/api/plugins`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'vault_session=session; vault_csrf=csrf-token',
        'x-csrf-token': 'csrf-token',
      },
      body: JSON.stringify({
        manifestFileName: 'service-private.plugin.json',
        manifest: { id: 'service-private', version: '1.0.1', category: 'service' },
      }),
    });
    assert.equal(manifestPluginUpload.status, 400);
    assert.match((await manifestPluginUpload.json()).message, /not a valid plugin upload: Schema version is required/);
    assert.deepEqual(calls.at(-1), ['createPrivatePlugin', 'user-1', 'service-private.plugin.json']);

    const invalidRequest = await fetch(`http://127.0.0.1:${port}/api/groups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ applicationId: '../outside', name: 'worker', unexpected: true }),
    });
    assert.equal(invalidRequest.status, 400);
    assert.match(invalidRequest.headers.get('content-type') ?? '', /application\/json/);
    const validationError = await invalidRequest.json();
    assert.equal(validationError.code, 'VALIDATION_ERROR');
    assert.match(validationError.message, /applicationId:/);
    assert.equal(validationError.issues.length, 2);
    assert.deepEqual(Object.keys(validationError.issues[0]).sort(), ['code', 'message', 'path']);
    assert.deepEqual(validationError.issues[0].path, ['applicationId']);
    assert.deepEqual(validationError.issues[1], {
      code: 'unknown_key',
      message: 'This field is not allowed',
      path: ['unexpected'],
    });
    const serializedValidationError = JSON.stringify(validationError);
    assert.doesNotMatch(serializedValidationError, /\.\.\/outside/);
    for (const issue of validationError.issues) {
      assert.equal(Object.hasOwn(issue, 'received'), false);
      assert.equal(Object.hasOwn(issue, 'expected'), false);
      assert.equal(Object.hasOwn(issue, 'meta'), false);
    }

    const wrongMethod = await fetch(`http://127.0.0.1:${port}/api/groups`);
    assert.equal(wrongMethod.status, 405);
    assert.equal((await wrongMethod.json()).code, 'METHOD_NOT_ALLOWED');

    const runtimeFailure = await fetch(`http://127.0.0.1:${port}/runtime/config`, {
      headers: { 'x-vault-key-id': 'vk_test', 'x-vault-secret': 'vs_test' },
    });
    assert.equal(runtimeFailure.status, 500);
    assert.deepEqual(await runtimeFailure.json(), { code: 'INTERNAL_ERROR', message: 'Vault request failed' });

    await postJson(port, '/api/groups', { applicationId: 'app-1', name: 'worker' });
    await postJson(port, '/api/plugins/sync', {});
    await postJson(port, '/api/plugins/import', { org: '@bsb', name: 'service-worker', pluginId: 'service-worker', packageName: '@bsb/service-worker', version: '1.0.0', kind: 'service', configSchema: {} });
    await postJson(port, '/api/plugins/import', { org: 'betterportal', name: 'service-betterportal-theme-bootstrap1', pluginId: 'service-betterportal-theme-bootstrap1', packageName: '@betterportal/theme-bootstrap1', version: '10.0.9', kind: 'service', configSchema: {} });
    await postJson(port, '/api/plugins/delete', { id: 'root-plugin' });
    await postJson(port, '/api/plugins/cleanup', {});
    await postJson(port, '/api/drafts', { profileId: 'profile-1', config: { services: { api: { plugin: 'service-api', enabled: true } } } });
    await postJson(port, '/api/profile-plugins', { profileId: 'profile-1', section: 'services', name: 'shared', plugin: 'service-api', enabled: true, config: { host: 'service-specific' } });
    await postJson(port, '/api/profile-plugins', { profileId: 'profile-1', section: 'services', name: 'api', plugin: 'service-api', enabled: true, config: { host: '0.0.0.0', port: 3200 } });
    await postJson(port, '/api/profile-plugins/delete', { profileId: 'profile-1', section: 'services', name: 'api' });
    await postJson(port, '/api/profile-plugins/copy', { sourceProfileId: 'profile-1', targetProfileId: 'profile-2', section: 'services', name: 'api', overwrite: 'on' });
    await postJson(port, '/api/application-profile-plugins', { applicationProfileId: 'app-profile-1', section: 'services', name: 'shared', plugin: 'service-api', enabled: true, config: { host: 'shared' } });
    await postJson(port, '/api/application-profile-plugins/delete', { applicationProfileId: 'app-profile-1', section: 'services', name: 'shared' });
    await postJson(port, '/api/application-profile-publish', { applicationProfileId: 'app-profile-1' });
    await postJson(port, '/api/runtime-keys', { profileId: 'profile-1', name: 'api-default', containerName: 'api-1' });
    await postJson(port, '/api/runtime-keys/rotate', { keyId: 'vk_old' });
    await postJson(port, '/api/applications/update', { id: 'app-1', name: 'App 2', description: 'Updated' });
    await postJson(port, '/api/applications/delete', { id: 'app-1' });
    await postJson(port, '/api/groups/update', { id: 'group-1', applicationId: 'app-1', name: 'worker' });
    await postJson(port, '/api/groups/delete', { id: 'group-1' });
    await postJson(port, '/api/profiles/update', { id: 'profile-1', groupId: 'group-1', name: 'prod' });
    await postJson(port, '/api/profiles/delete', { id: 'profile-1' });
    assert.ok(registryAuthorization.length >= 2);
    assert.ok(registryAuthorization.every((value) => value === 'Bearer vault-registry-token'));
    assert.deepEqual(calls, [
      ['publishPrivatePlugin', 'bv_p_test', 'service-private', '1.1.0'],
      ['createPrivatePlugin', 'user-1', 'service-private.json'],
      ['createPrivatePlugin', 'user-1', 'service-private.plugin.json'],
      ['createDeployment', 'user-1', 'app-1', 'worker'],
      ['createPlugin', 'user-1', 'service-betterportal-theme-bootstrap1', '10.0.9', '@betterportal/theme-bootstrap1'],
      ['cleanupUnusedImportedPlugins', 'user-1'],
      ['createPlugin', 'user-1', 'service-worker', '1.0.0', '@bsb/service-worker'],
      ['createPlugin', 'user-1', 'service-betterportal-theme-bootstrap1', '10.0.9', '@betterportal/theme-bootstrap1'],
      ['deletePlugin', 'user-1', 'root-plugin'],
      ['cleanupUnusedPlugins', 'user-1'],
      ['saveProfileDraft', 'user-1', 'profile-1', { services: { api: { plugin: 'service-api', enabled: true } } }],
      ['upsertProfilePlugin', 'user-1', 'profile-1', 'services', 'shared', 'service-api', { host: 'service-specific' }],
      ['upsertProfilePlugin', 'user-1', 'profile-1', 'services', 'api', 'service-api', { host: '0.0.0.0', port: 3200 }],
      ['removeProfilePlugin', 'user-1', 'profile-1', 'services', 'api'],
      ['copyProfilePlugin', 'user-1', 'profile-1', 'profile-2', 'services', 'api', true],
      ['upsertApplicationProfilePlugin', 'user-1', 'app-profile-1', 'services', 'shared', 'service-api', { host: 'shared' }],
      ['removeApplicationProfilePlugin', 'user-1', 'app-profile-1', 'services', 'shared'],
      ['publishApplicationProfileDraft', 'user-1', 'app-profile-1'],
      ['createProfileRuntimeKey', 'user-1', 'profile-1', 'api-default', 'api-1'],
      ['rotateProfileRuntimeKey', 'user-1', 'vk_old'],
      ['updateApplication', 'user-1', 'app-1', 'App 2', 'Updated'],
      ['deleteApplication', 'user-1', 'app-1'],
      ['updateGroup', 'user-1', 'group-1', 'app-1', 'worker'],
      ['deleteGroup', 'user-1', 'group-1'],
      ['updateProfile', 'user-1', 'profile-1', 'group-1', 'prod'],
      ['deleteProfile', 'user-1', 'profile-1'],
    ]);
    assert.ok(spans.length > 1);
    assert.equal(spans.filter((span) => span.name === 'vault.http.request').every((span) => span.ended), true);
    assert.equal(spans.filter((span) => span.name === 'vault.http.request').every((span) => typeof span.endAttributes['http.response.status_code'] === 'number'), true);
    const failedSpan = spans.find((span) => span.errors.some((entry) => entry.error.message === 'database exploded'));
    assert.ok(failedSpan);
    assert.deepEqual(runtimeTraceIds, [failedSpan.trace.t]);
    assert.equal(failedSpan.endAttributes['http.response.status_code'], 500);
    assert.ok(logs.some((entry) => entry.level === 'error' && entry.trace.t === failedSpan.trace.t && /database exploded/.test(entry.meta.error)));
  } finally {
    await server.stop();
    await new Promise((resolve) => registryServer.close(resolve));
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
