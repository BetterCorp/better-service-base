const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

module.exports = async ({ pluginRoot }) => {
  const load = name => import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault', name)).href);
  const { VaultService } = await load('vault.js');
  const { decryptJson } = await load('crypto.js');
  const key = Buffer.alloc(32, 4);
  const sharedDrafts = new Map();
  const drafts = new Map();
  const save = (records, id, record, expectedIv) => {
    if (expectedIv !== undefined && (records.get(id)?.iv ?? null) !== expectedIv) throw new Error('Draft changed; reload before copying');
    records.set(id, record);
  };
  const audits = [];
  const sharedProfiles = [{ id: 'shared-source', applicationId: 'app-1', name: 'default' }, { id: 'shared-target', applicationId: 'app-2', name: 'prod' }];
  const profiles = [{ id: 'node', groupId: 'group-1', name: 'prod', language: 'nodejs' },
    { id: 'other-node', groupId: 'group-2', name: 'prod', language: 'nodejs' },
    { id: 'python', groupId: 'group-2', name: 'prod', language: 'python' }];
  const store = {
    async getApplicationProfileById(id) { return sharedProfiles.find(profile => profile.id === id); },
    async resolveProfileBinding(id) { const profile = profiles.find(profile => profile.id === id); return profile && { profile }; },
    async getApplicationDraft(id) { return sharedDrafts.get(id); },
    async getDraft(id) { return drafts.get(id); },
    async upsertApplicationDraft(record, expectedIv) { save(sharedDrafts, record.applicationProfileId, record, expectedIv); },
    async upsertDraft(record, expectedIv) { save(drafts, record.profileId, record, expectedIv); },
    async listPlugins() { return [{ pluginId: 'events-rabbitmq', language: 'nodejs', kind: 'events', version: '1.0.0', packageName: '@bsb/events-rabbitmq' }]; },
    async getUser() { return null; }, async audit(record) { audits.push(record); },
  };
  const vault = new VaultService({ store, masterKey: key, setupCode: 'test', publicUrl: 'https://vault.example' });
  const source = { plugin: 'events-rabbitmq', language: 'nodejs', package: '@bsb/events-rabbitmq', version: '1.0.0', enabled: true, config: { credentials: { password: 'copy-secret' } } };
  await vault.saveApplicationProfileDraft('admin', 'shared-source', { events: { rabbit: source } });
  const input = { sourceProfileId: 'shared-source', sourceType: 'shared', targetProfileId: 'shared-target', targetType: 'shared', section: 'events', name: 'rabbit', overwrite: false };
  await vault.copyProfilePlugin('admin', input);
  assert.deepEqual((await vault.getApplicationProfileDraft('shared-target')).events.rabbit, source);
  assert.equal(decryptJson(sharedDrafts.get('shared-target'), key, 'vault:application-draft:shared-target').prod.events.rabbit.config.credentials.password, 'copy-secret');
  assert.ok(!JSON.stringify(sharedDrafts.get('shared-target')).includes('copy-secret'));
  assert.equal(audits.at(-1).action, 'application-config.plugin.copy');
  await assert.rejects(vault.copyProfilePlugin('admin', input), /already exists/);
  const sourceBefore = await vault.getApplicationProfileDraft('shared-source');
  await vault.saveApplicationProfileDraft('admin', 'shared-target', { services: { keep: { plugin: 'service-keep', enabled: false } }, events: { rabbit: { ...source, enabled: false } } });
  await vault.copyProfilePlugin('admin', { ...input, overwrite: true });
  const copied = await vault.getApplicationProfileDraft('shared-target');
  assert.deepEqual(copied.events.rabbit, source);
  assert.equal(copied.services.keep.plugin, 'service-keep');
  assert.deepEqual(await vault.getApplicationProfileDraft('shared-source'), sourceBefore);

  await vault.copyProfilePlugin('admin', { ...input, targetType: 'deployment', targetProfileId: 'node' });
  assert.deepEqual((await vault.getProfileDraft('node')).events.rabbit, source);
  assert.equal(audits.at(-1).action, 'config.plugin.copy');
  const promoted = { ...source, config: { credentials: { password: 'deployment-secret' } } };
  await vault.saveProfileDraft('admin', 'node', { events: { rabbit: promoted } });
  const promoteInput = { ...input, sourceProfileId: 'node', sourceType: 'deployment' };
  await assert.rejects(vault.copyProfilePlugin('admin', promoteInput), /already exists/);
  await vault.copyProfilePlugin('admin', { ...promoteInput, overwrite: true });
  assert.deepEqual((await vault.getApplicationProfileDraft('shared-target')).events.rabbit, promoted);
  assert.deepEqual((await vault.getProfileDraft('node')).events.rabbit, promoted);
  assert.equal(audits.at(-1).action, 'application-config.plugin.copy');
  await assert.rejects(vault.copyProfilePlugin('admin', { ...input, targetType: 'deployment', targetProfileId: 'python' }), /requires nodejs.*python/);
  assert.equal(drafts.has('python'), false);
  await vault.saveApplicationProfileDraft('admin', 'shared-target', { events: { rabbit: { ...source, language: 'python', enabled: false } } });
  await assert.rejects(vault.copyProfilePlugin('admin', { ...input, overwrite: true }), /language must match/);
  assert.equal((await vault.getApplicationProfileDraft('shared-target')).events.rabbit.language, 'python');
  for (const change of [{ targetProfileId: 'missing' }, { sourceProfileId: 'missing' }, { name: 'missing' }, { targetProfileId: 'shared-source', overwrite: true }]) {
    await assert.rejects(vault.copyProfilePlugin('admin', { ...input, ...change }), /not found|must differ/);
  }
  // Existing deployment-to-deployment callers need no new fields.
  await vault.saveProfileDraft('admin', 'node', { events: { rabbit: { ...source, enabled: false } } });
  await vault.copyProfilePlugin('admin', { sourceProfileId: 'node', targetProfileId: 'other-node', section: 'events', name: 'rabbit', overwrite: false });
  assert.deepEqual((await vault.getProfileDraft('other-node')).events.rabbit, { ...source, enabled: false });
  await assert.rejects(vault.copyProfilePlugin('admin', { sourceProfileId: 'node', targetProfileId: 'python', section: 'events', name: 'rabbit', overwrite: true }), /requires nodejs.*python/);
  await vault.saveApplicationProfileDraft('admin', 'shared-source', { events: { rabbit: { ...source, enabled: false } } });
  await assert.rejects(vault.copyProfilePlugin('admin', { ...input, targetType: 'deployment', targetProfileId: 'python' }), /requires nodejs.*python/);
  assert.equal(drafts.has('python'), false);
  for (const targetType of ['shared', 'deployment']) {
    const targetProfileId = targetType === 'shared' ? 'shared-target' : 'other-node';
    const records = targetType === 'shared' ? sharedDrafts : drafts;
    for (const existing of [false, true]) {
      records.delete(targetProfileId);
      const keep = { services: { keep: { plugin: 'service-keep', enabled: false } } };
      if (existing) {
        if (targetType === 'shared') await vault.saveApplicationProfileDraft('admin', targetProfileId, keep);
        else await vault.saveProfileDraft('admin', targetProfileId, keep);
      }
      const results = await Promise.allSettled([1, 2].map(() => vault.copyProfilePlugin('admin', { ...input, targetType, targetProfileId })));
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      assert.match(results.find(result => result.status === 'rejected').reason.message, /Draft changed/);
      const result = targetType === 'shared' ? await vault.getApplicationProfileDraft(targetProfileId) : await vault.getProfileDraft(targetProfileId);
      assert.equal(result.events.rabbit.config.credentials.password, 'copy-secret');
      if (existing) assert.deepEqual(result.services, keep.services);
    }
  }
};
