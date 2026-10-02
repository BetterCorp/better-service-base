const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

module.exports = async ({ pluginRoot }) => {
  const { VaultService } = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/vault.js')).href);
  let replacement;
  const store = {
    async getUser() { return null; },
    async getRuntimeKey(id) {
      assert.equal(id, 'vk_old');
      return {
        id, name: 'service', profileId: 'profile-1', groupId: 'old-group', applicationId: 'old-app',
        configPluginId: 'config-vault', containerName: null, secretHash: 'old-hash', revokedAt: null,
      };
    },
    async resolveProfileBinding(id) {
      assert.equal(id, 'profile-1');
      return {
        application: { id: 'new-app' }, group: { id: 'new-group', applicationId: 'new-app' },
        profile: { id: 'profile-1', groupId: 'new-group' },
      };
    },
    async rotateRuntimeKey(_oldId, record) { replacement = record; return true; },
    async audit() {},
  };
  const vault = new VaultService({ store, masterKey: Buffer.alloc(32), setupCode: 'unused', publicUrl: 'https://vault.example' });
  const rotated = await vault.rotateProfileRuntimeKey('admin', { keyId: 'vk_old' });
  assert.equal(replacement.applicationId, 'new-app');
  assert.equal(replacement.groupId, 'new-group');
  assert.equal(replacement.profileId, 'profile-1');
  assert.equal(replacement.id, rotated.keyId);
  assert.match(rotated.secret, /^vs_[A-Za-z0-9_-]+$/);
};
