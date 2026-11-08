const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { createHash } = require('node:crypto');

module.exports = async ({ pluginRoot }) => {
  const { VaultService } = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/vault.js')).href);
  const failures = new Map();
  const globalAttempts = new Map();
  const audits = [];
  let auditAvailable = true;
  const store = {
    async consumeAuthenticationBudget(id, maximum) {
      const count = (globalAttempts.get(id) ?? 0) + 1;
      globalAttempts.set(id, count);
      return count <= maximum;
    },
    async authenticationAllowed(id) { return (failures.get(id)?.failureCount ?? 0) < 5; },
    async getUserByEmail() { return null; },
    async getUser() { return { email: 'admin@example.com' }; },
    async recordAuthenticationFailure(id, subject) {
      failures.set(id, { subjectHash: id, subject, failureCount: (failures.get(id)?.failureCount ?? 0) + 1 });
    },
    async recordExistingAuthenticationFailure(id, subject) {
      const existing = failures.get(id);
      if (existing) failures.set(id, { subjectHash: id, subject, failureCount: existing.failureCount + 1 });
    },
    async listAuthenticationBlocks() { return [...failures.values()].filter(row => row.failureCount >= 5); },
    async clearAuthenticationFailures(id) {
      assert.equal(audits.at(-1).outcome, 'intent');
      failures.delete(id);
    },
    async audit(record) {
      if (!auditAvailable) throw new Error('Audit unavailable');
      audits.push(record);
    },
  };
  const vault = new VaultService({ store, masterKey: Buffer.alloc(32), setupCode: 'test', publicUrl: 'http://localhost' });
  for (let i = 0; i < 5; i++) await assert.rejects(vault.login(' User@example.com ', 'never-record-this-password', ''), /Invalid login/);
  const id = createHash('sha256').update('login:user@example.com').digest('base64url');
  assert.deepEqual(await vault.authenticationBlocks(), [{ subjectHash: id, subject: 'login:user@example.com', failureCount: 5 }]);
  await assert.rejects(vault.login('user@example.com', 'wrong', ''), /Too many authentication attempts/);
  assert.equal([...globalAttempts.values()].reduce((sum, value) => sum + value, 0), 5,
    'blocked subjects continued consuming the shared authentication budget');
  await assert.rejects(vault.clearAuthenticationBlock('admin', '../invalid'), /Invalid authentication block ID/);
  auditAvailable = false;
  await assert.rejects(vault.clearAuthenticationBlock('admin', id), /Audit unavailable/);
  assert.equal((await vault.authenticationBlocks()).length, 1);
  auditAvailable = true;
  await vault.clearAuthenticationBlock('admin', id);
  assert.deepEqual(await vault.authenticationBlocks(), []);
  assert.equal(audits.at(-1).action, 'authentication.block.cleared');
  assert.equal(audits.at(-1).actor, 'admin');
  assert.equal(audits.at(-1).target, id);
  await assert.rejects(vault.login('user@example.com', 'wrong', ''), /Invalid login/);
  assert.equal(failures.get(id).failureCount, 1);
  assert.ok(!JSON.stringify([...failures, ...audits]).includes('never-record-this-password'));

  globalAttempts.clear();
  failures.clear();
  const rotatingVault = new VaultService({
    store, masterKey: Buffer.alloc(32), setupCode: 'test', publicUrl: 'http://localhost',
    authenticationBudgets: { login: 3 },
  });
  for (const email of ['one@example.com', 'two@example.com', 'three@example.com'])
    await assert.rejects(rotatingVault.login(email, 'wrong', ''), /Invalid login/);
  await assert.rejects(rotatingVault.login('four@example.com', 'wrong', ''), /Too many authentication attempts/);
  const firstId = createHash('sha256').update('login:one@example.com').digest('base64url');
  for (let i = 0; i < 4; i++)
    await assert.rejects(rotatingVault.login('one@example.com', 'wrong', ''), /Too many authentication attempts/);
  assert.equal(failures.get(firstId).failureCount, 5,
    'an exhausted shared budget stopped advancing an existing subject lockout');
  await assert.rejects(rotatingVault.login('one@example.com', 'wrong', ''), /Too many authentication attempts/);
  assert.equal(globalAttempts.size, 1, 'rotating identities created multiple global limiter buckets');
  assert.equal(failures.size, 3, 'an exhausted shared budget created another subject limiter row');
};
