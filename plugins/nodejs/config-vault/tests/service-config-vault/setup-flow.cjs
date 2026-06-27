const assert = require('node:assert');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

module.exports = async ({ pluginRoot }) => {
  const { VaultService } = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/vault.js')).href);
  const crypto = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/crypto.js')).href);

  const users = [];
  const audits = [];
  const store = {
    async countAdmins() { return users.length; },
    async createUser(user) { users.push(user); },
    async createPasskey() { throw new Error('passkeys should not be created during first setup'); },
    async audit(record) { audits.push(record); },
  };

  const vault = new VaultService({
    store,
    masterKey: Buffer.alloc(32),
    setupCode: 'setup-code',
  });

  await assert.rejects(() => vault.createFirstAdmin({
    setupCode: 'setup-code',
    email: 'admin@example.com',
    password: 'correct horse battery staple',
    passwordConfirm: 'different password value',
  }), /passwords do not match/i);

  const result = await vault.createFirstAdmin({
    setupCode: 'setup-code',
    email: 'admin@example.com',
    password: 'correct horse battery staple',
    passwordConfirm: 'correct horse battery staple',
  });

  assert.equal(users.length, 1);
  assert.equal(users[0].email, 'admin@example.com');
  assert.equal(users[0].passkeyRequired, false);
  assert.equal(result.email, 'admin@example.com');
  assert.match(result.totpSecret, /^[A-Z2-7]+$/);
  assert.match(result.totpUri, /^otpauth:\/\/totp\//);
  assert.equal(crypto.verifyTotp(result.totpSecret, crypto.generateTotp(result.totpSecret)), true);
  assert.equal(audits.some((audit) => audit.action === 'admin.created'), true);
};
