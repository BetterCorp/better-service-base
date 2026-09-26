const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

module.exports = async ({ pluginRoot }) => {
  const load = (file) => import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault', file)).href);
  const { VaultService } = await load('vault.js');
  const { requestSchemas } = await load('http-validation.js');
  const drafts = new Map();
  const sharedDrafts = new Map();
  const vault = new VaultService({
    masterKey: Buffer.alloc(32), setupCode: 'setup', publicUrl: 'http://localhost',
    store: {
      async resolveProfileBinding() { return { profile: { name: 'default' } }; },
      async getApplicationProfileById() { return { name: 'default' }; },
      async getDraft(id) { return drafts.get(id); },
      async getApplicationDraft(id) { return sharedDrafts.get(id); },
      async upsertDraft(record) { drafts.set(record.profileId, record); },
      async upsertApplicationDraft(record) { sharedDrafts.set(record.applicationProfileId, record); },
      async getUser() { return null; },
      async audit() {},
    },
  });
  const originalName = 'betterportal/service-betterportal-auth-default';
  const name = 'betterportal-service-betterportal-auth-default';
  const entry = { plugin: 'service-betterportal-auth-default', enabled: true, version: '1.0.0', config: { secret: 'preserve-me', nested: { port: 42 } } };
  for (const shared of [false, true]) {
    const prefix = shared ? '/api/application-profile-plugins' : '/api/profile-plugins';
    const idField = shared ? 'applicationProfileId' : 'profileId';
    const save = (config) => shared ? vault.saveApplicationProfileDraft('user', 'profile', config) : vault.saveProfileDraft('user', 'profile', config);
    const read = () => shared ? vault.getApplicationProfileDraft('profile') : vault.getProfileDraft('profile');
    const rename = (newName, oldName = originalName) => vault.renameConfigPlugin('user', { profileId: 'profile', shared, section: 'services', originalName: oldName, name: newName });
    await save({ services: { [originalName]: entry, occupied: { plugin: 'service-other' } } });
    const body = { [idField]: 'profile', section: 'services', originalName, name };
    assert.equal(requestSchemas[`${prefix}/rename`].safeParse(body).success, true);
    assert.equal(requestSchemas[`${prefix}/rename`].safeParse({ ...body, name: originalName }).success, false);
    assert.equal(requestSchemas[prefix].safeParse({ [idField]: 'profile', section: 'services', name: originalName, plugin: entry.plugin }).success, false);
    assert.equal(requestSchemas[prefix].safeParse({ [idField]: 'profile', section: 'services', name, plugin: originalName }).success, false);
    await assert.rejects(rename('occupied'), /already exists/);
    await assert.rejects(rename(originalName), /safe identifier/);
    await assert.rejects(rename('__proto__'), /safe identifier/);
    await assert.rejects(rename(name, 'missing'), /not found/);
    assert.deepEqual((await read()).services[originalName], entry);
    await rename(name);
    const draft = await read();
    assert.equal(Object.hasOwn(draft.services, originalName), false);
    assert.deepEqual(draft.services[name], entry);
    assert.deepEqual(draft.services.occupied, { plugin: 'service-other' });
    await rename('custom-name', name);
    assert.deepEqual((await read()).services['custom-name'], entry);

    await save({ services: { [name]: entry } });
    const deletion = { [idField]: 'profile', section: 'services', name };
    assert.equal(requestSchemas[`${prefix}/delete`].safeParse(deletion).success, true);
    assert.equal(requestSchemas[`${prefix}/delete`].safeParse({ ...deletion, name: originalName }).success, false);
    if (shared) await vault.removeApplicationProfilePlugin('user', deletion);
    else await vault.removeProfilePlugin('user', deletion);
    assert.deepEqual((await read()).services, {});
  }
};
