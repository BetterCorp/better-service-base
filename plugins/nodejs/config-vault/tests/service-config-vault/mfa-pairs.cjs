const assert = require('node:assert');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { createHash } = require('node:crypto');

module.exports = async ({ pluginRoot }) => {
  const { VaultService } = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/vault.js')).href);
  const crypto = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/crypto.js')).href);
  const key = Buffer.alloc(32);
  const firstSecret = crypto.createTotpSecret();
  const secondSecret = crypto.createTotpSecret();
  const encrypted = crypto.encryptJson(secondSecret, key);
  let lastStep = null;
  const sessions = [];
  const challenges = new Map();
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
    async authenticationAllowed() { return true; },
    async recordAuthenticationFailure() {},
    async clearAuthenticationFailures() {},
    async consumeAuthChallenge(kind, key) {
      const value = challenges.get(`${kind}:${key}`) ?? null;
      challenges.delete(`${kind}:${key}`);
      return value;
    },
    async getUser() { return { id: 'user-1', email: 'admin@example.com' }; },
    async audit() {},
  };
  const vault = new VaultService({ store, masterKey: key, setupCode: 'setup', publicUrl: 'http://localhost:8080' });

  const challenge = (token) => challenges.set(`totp-login:${createHash('sha256').update(token).digest('base64url')}`, { userId: 'user-1', methodId: method.id });
  challenge('wrong-pair');
  await assert.rejects(() => vault.finishTotpLogin('wrong-pair', crypto.generateTotp(firstSecret)), /Invalid TOTP/);

  const code = crypto.generateTotp(secondSecret);
  challenge('right-pair');
  const session = await vault.finishTotpLogin('right-pair', code);
  assert.equal(typeof session.sessionId, 'string');
  assert.equal(sessions.length, 1);

  challenge('replay');
  await assert.rejects(() => vault.finishTotpLogin('replay', code), /Invalid TOTP/);
};
