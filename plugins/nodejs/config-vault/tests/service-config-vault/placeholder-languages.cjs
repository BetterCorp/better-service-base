const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

module.exports = async ({ pluginRoot }) => {
  const { VaultService } = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/vault.js')).href);
  const profiles = [
    { id: 'legacy', name: 'legacy' },
    ...['nodejs', 'python', 'python', 'go'].map((language, index) => ({ id: `p${index}`, name: `p${index}`, language })),
  ];
  const drafts = new Map();
  const plugins = ['nodejs', 'python'].flatMap(language => ['service', 'events', 'observable'].map(kind => ({
    language, pluginId: `${kind}-demo`, kind, packageName: `${language}-demo`, version: '1.2.3',
  })));
  const store = {
    async listProfiles() { return profiles; },
    async resolveProfileBinding(id) { return { group: { id: 'group' }, profile: profiles.find(profile => profile.id === id) }; },
    async listPlugins() { return plugins; },
    async getDraft(id) { return drafts.get(id); },
    async upsertDraft(record) { drafts.set(record.profileId, record); },
    async getUser() { return null; },
    async audit() {},
  };
  const vault = new VaultService({ store, masterKey: Buffer.alloc(32, 7), setupCode: 'test', publicUrl: 'https://vault.example' });
  for (const [source, language] of [['p1', 'python'], ['legacy', 'nodejs']]) {
    for (const section of ['services', 'events', 'observable']) {
      const alias = `${language}-${section}`;
      const plugin = `${section === 'services' ? 'service' : section}-demo`;
      await vault.upsertProfilePlugin('admin', {
        profileId: source, section, name: alias, plugin,
        packageName: `${language}-demo`, version: '1.2.3', enabled: true,
      });
      for (const profile of profiles) {
        const entry = (await vault.getProfileDraft(profile.id))?.[section]?.[alias];
        if ((profile.language ?? 'nodejs') !== language) {
          assert.equal(entry, undefined, 'other-language profile must not receive a placeholder');
        } else {
          assert.deepEqual(entry, { language, plugin, package: `${language}-demo`, version: '1.2.3', enabled: profile.id === source });
        }
      }
      const peer = profiles.find(profile => profile.id !== source && (profile.language ?? 'nodejs') === language);
      const peerDraft = await vault.getProfileDraft(peer.id);
      peerDraft[section][alias].config = { preserved: true };
      await vault.saveProfileDraft('admin', peer.id, peerDraft);
      await vault.upsertProfilePlugin('admin', { profileId: source, section, name: alias, plugin, enabled: true });
      assert.deepEqual((await vault.getProfileDraft(peer.id))[section][alias].config, { preserved: true });
    }
  }
};
