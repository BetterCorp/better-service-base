const assert = require('node:assert');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

module.exports = async ({ pluginRoot }) => {
  const crypto = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/crypto.js')).href);
  const key = crypto.loadMasterKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
  const payload = { default: { services: { api: { plugin: 'service-api', enabled: true } } } };
  const encrypted = crypto.encryptJson(payload, key);

  assert.equal(encrypted.encryptedPayload.includes('service-api'), false);
  assert.deepStrictEqual(crypto.decryptJson(encrypted, key), payload);

  const hash = await crypto.hashSecret('correct horse battery staple');
  assert.equal(await crypto.verifySecret('correct horse battery staple', hash), true);
  assert.equal(await crypto.verifySecret('wrong', hash), false);

  const secret = 'AAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const code = crypto.generateTotp(secret, 1234);
  assert.equal(crypto.verifyTotp(secret, code, 1234 * 30000), true);
  assert.equal(crypto.verifyTotp(secret, '123456', 1234 * 30000), false);

  const generated = crypto.createTotpSecret();
  assert.match(generated, /^[A-Z2-7]+$/);
  assert.equal(crypto.verifyTotp(generated, crypto.generateTotp(generated)), true);

  const uri = crypto.createTotpUri(generated, 'admin@example.com');
  assert.match(uri, /^otpauth:\/\/totp\//);
  assert.match(uri, /secret=/);
};
