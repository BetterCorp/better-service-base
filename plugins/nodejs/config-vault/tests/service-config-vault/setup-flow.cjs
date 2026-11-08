const assert = require('node:assert');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

module.exports = async ({ pluginRoot }) => {
  const { VaultService } = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/vault.js')).href);
  const crypto = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/crypto.js')).href);

  const users = [];
  const authMethods = [];
  const audits = [];
  const challenges = new Map();
  const failures = new Map();
  const store = {
    async countAdmins() { return users.length; },
    async createFirstUser(user, method) {
      if (users.length > 0) return false;
      users.push({ ...user, totpSecret: null });
      authMethods.push(method);
      return true;
    },
    async getUser(id) { return users.find((user) => user.id === id) ?? null; },
    async getUserByEmail(email) { return users.find((user) => user.email === email) ?? null; },
    async listPasskeys() { return []; },
    async listAuthMethods(userId) { return authMethods.filter((method) => method.userId === userId); },
    async authenticationAllowed(id) { return (failures.get(id) ?? 0) < 5; },
    async recordAuthenticationFailure(id) { failures.set(id, (failures.get(id) ?? 0) + 1); },
    async clearAuthenticationFailures(id) { failures.delete(id); },
    async saveAuthChallenge(kind, key, payload) { challenges.set(`${kind}:${key}`, payload); },
    async getAuthChallenge(kind, key) { return challenges.get(`${kind}:${key}`) ?? null; },
    async deleteAuthChallenge(kind, key) { challenges.delete(`${kind}:${key}`); },
    async createPasskey() { throw new Error('passkeys should not be created during first setup'); },
    async setUserPasskeyRequired() { throw new Error('passkey should not be marked required during first setup'); },
    async updatePasskeyCounter() { throw new Error('passkey counter should not change during first setup'); },
    async audit(record) { audits.push(record); },
  };

  const vault = new VaultService({
    store,
    masterKey: Buffer.alloc(32),
    setupCode: 'setup-code',
    publicUrl: 'http://localhost:8080',
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
  assert.equal(authMethods.length, 1);
  assert.equal(authMethods[0].active, false);
  assert.equal(result.email, 'admin@example.com');
  assert.match(result.totpSecret, /^[A-Z2-7]+$/);
  assert.match(result.totpUri, /^otpauth:\/\/totp\//);
  assert.equal(crypto.verifyTotp(result.totpSecret, crypto.generateTotp(result.totpSecret)), true);

  await assert.rejects(() => vault.createFirstAdmin({
    setupCode: 'setup-code',
    email: 'second@example.com',
    password: 'correct horse battery staple',
    passwordConfirm: 'correct horse battery staple',
  }), /admin already exists/i);

  for (let attempt = 0; attempt < 4; attempt++) {
    const currentTotp = crypto.generateTotp(result.totpSecret);
    const invalidTotp = currentTotp === '000000' ? '000001' : '000000';
    await assert.rejects(
      () => vault.login('admin@example.com', 'correct horse battery staple', invalidTotp),
      /Invalid login/,
    );
  }
  assert.equal([...failures.values()].reduce((sum, count) => sum + count, 0), 4,
    'password verification reset pending-enrollment TOTP failures');

  const login = await vault.login('admin@example.com', 'correct horse battery staple', crypto.generateTotp(result.totpSecret));
  assert.equal(login.status, 'passkey_setup_required');
  assert.equal(failures.size, 0);
  assert.equal(typeof login.setupToken, 'string');
  assert.equal(await vault.consumePasskeySetupToken(login.setupToken), users[0].id);

  assert.equal(audits.some((audit) => audit.action === 'admin.created'), true);
  assert.equal(audits.some((audit) => audit.action === 'admin.passkey.setup.required'), true);
};
