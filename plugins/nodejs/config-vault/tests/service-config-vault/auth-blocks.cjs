const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { createHash } = require('node:crypto');

module.exports = async ({ pluginRoot }) => {
  const { VaultService } = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/vault.js')).href);
  const failures = new Map();
  const globalAttempts = new Map();
  const authenticationChecks = [];
  const audits = [];
  let auditAvailable = true;
  const store = {
    async consumeAuthenticationBudget(id, maximum) {
      const count = (globalAttempts.get(id) ?? 0) + 1;
      globalAttempts.set(id, count);
      return count <= maximum;
    },
    async authenticationAllowed(id, maximum = 5) {
      authenticationChecks.push({ id, maximum });
      return (globalAttempts.get(id) ?? failures.get(id)?.failureCount ?? 0) < maximum;
    },
    async getUserByEmail(email) {
      if (email === 'known@example.com') return {
        id: 'known-user',
        email,
        status: 'active',
        passwordHash: { split() { throw new Error('password verification invoked after shared admission failed'); } },
      };
      if (email === 'inactive@example.com') return {
        id: 'inactive-user',
        email,
        status: 'inactive',
        passwordHash: 'scrypt$paWlpaWlpaWlpaWlpaWlpQ$whF1cVVIxEqgHaTNq1G9hRZCCl15nQFZCFbJvPIZEG3n9MoskVLHe0jual65dVDuqAzFeiBnM-YRGCsjlHk2Rw',
      };
      return null;
    },
    async getUser() { return { email: 'admin@example.com' }; },
    async resolveRuntimeBinding() { return null; },
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
  await assert.rejects(
    vault.login('inactive@example.com', 'not-a-real-vault-password', ''),
    /Invalid login/,
    'an inactive account matching the dummy verification record must remain ineligible',
  );
  globalAttempts.clear();
  failures.clear();
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
  await assert.rejects(rotatingVault.login('known@example.com', 'wrong', ''), /Too many authentication attempts/,
    'an exhausted shared budget reached password verification for a known account');
  const globalLoginId = createHash('sha256').update('global:login').digest('base64url');
  assert.deepEqual(authenticationChecks.at(-1), { id: globalLoginId, maximum: 3 },
    'an exhausted shared budget was not checked before dummy password verification');
  const firstId = createHash('sha256').update('login:one@example.com').digest('base64url');
  for (let i = 0; i < 4; i++)
    await assert.rejects(rotatingVault.login('one@example.com', 'wrong', ''), /Too many authentication attempts/);
  assert.equal(failures.get(firstId).failureCount, 5,
    'an exhausted shared budget stopped advancing an existing subject lockout');
  await assert.rejects(rotatingVault.login('one@example.com', 'wrong', ''), /Too many authentication attempts/);
  const knownKey = 'login:known@example.com';
  await assert.rejects(rotatingVault.recordFailure(knownKey, true), /Too many authentication attempts/);
  const knownId = createHash('sha256').update(knownKey).digest('base64url');
  assert.equal(failures.get(knownId).failureCount, 1,
    'an exhausted shared budget disabled lockout for a known subject without prior failures');
  assert.equal(globalAttempts.size, 1, 'rotating identities created multiple global limiter buckets');
  assert.equal(failures.size, 4, 'an exhausted shared budget created an unknown subject limiter row');

  globalAttempts.clear();
  failures.clear();
  audits.length = 0;
  const runtimeVault = new VaultService({
    store, masterKey: Buffer.alloc(32), setupCode: 'test', publicUrl: 'http://localhost',
    authenticationBudgets: { runtime: 10_000 },
  });
  await Promise.all(Array.from({ length: 10_000 }, (_, i) =>
    assert.rejects(runtimeVault.resolveRuntimeConfig(`fabricated-${i}`, 'wrong'),
      /Invalid Vault API key|Too many authentication attempts/)));
  const restartedRuntimeVault = new VaultService({
    store, masterKey: Buffer.alloc(32), setupCode: 'test', publicUrl: 'http://localhost',
    authenticationBudgets: { runtime: 10_000 },
  });
  await assert.rejects(restartedRuntimeVault.resolveRuntimeConfig('fabricated-after-restart', 'wrong'),
    /Too many authentication attempts/);
  assert.deepEqual([...failures.values()].map((failure) => failure.subject), ['runtime:unknown'],
    'rotating runtime key IDs created independent lockout rows');
  assert.equal(globalAttempts.size, 1, 'rotating runtime key IDs created multiple shared-budget rows');
  assert.equal(audits.length, 1, 'rotating runtime key IDs created more than one audit row per bucket');
  assert.equal(audits[0].actor, 'runtime:unknown');
  assert.equal(audits[0].target, 'runtime:unknown');
  assert.deepEqual(audits[0].details.aggregated, true);
  assert.equal(JSON.stringify(audits).includes('fabricated-'), false,
    'fabricated runtime key IDs leaked into the audit log');
};
