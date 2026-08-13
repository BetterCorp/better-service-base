const assert = require('node:assert');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

module.exports = async ({ pluginRoot }) => {
  const { VaultService } = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/vault.js')).href);
  const crypto = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/crypto.js')).href);
  const key = Buffer.alloc(32);
  const firstSecret = crypto.createTotpSecret();
  const secondSecret = crypto.createTotpSecret();
  const encrypted = crypto.encryptJson(secondSecret, key);
  let lastStep = null;
  const sessions = [];
  const method = {
    id: 'method-2', userId: 'user-1', label: 'Phone', active: true, credentialId: 'credential-2',
    publicKey: {}, signCount: 0, lastTotpStep: null, createdAt: new Date().toISOString(),
    encryptedTotp: encrypted.encryptedPayload, iv: encrypted.iv, authTag: encrypted.authTag, keyVersion: encrypted.keyVersion,
  };
  const store = {
    async getAuthMethod(id) { return id === method.id ? method : null; },
    async useTotpStep(id, step) {
      assert.equal(id, method.id);
      if (lastStep !== null && lastStep >= step) return false;
      lastStep = step;
      return true;
    },
    async createSession(session) { sessions.push(session); },
    async getUser() { return { id: 'user-1', email: 'admin@example.com' }; },
    async audit() {},
  };
  const vault = new VaultService({ store, masterKey: key, setupCode: 'setup', publicUrl: 'http://localhost:8080' });

  vault.pendingTotpLogins.set('wrong-pair', { userId: 'user-1', methodId: method.id, expiresAt: Date.now() + 60_000 });
  await assert.rejects(() => vault.finishTotpLogin('wrong-pair', crypto.generateTotp(firstSecret)), /Invalid TOTP/);

  const code = crypto.generateTotp(secondSecret);
  vault.pendingTotpLogins.set('right-pair', { userId: 'user-1', methodId: method.id, expiresAt: Date.now() + 60_000 });
  const session = await vault.finishTotpLogin('right-pair', code);
  assert.equal(typeof session.sessionId, 'string');
  assert.equal(sessions.length, 1);

  vault.pendingTotpLogins.set('replay', { userId: 'user-1', methodId: method.id, expiresAt: Date.now() + 60_000 });
  await assert.rejects(() => vault.finishTotpLogin('replay', code), /Invalid TOTP/);
};
