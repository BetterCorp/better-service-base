const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

module.exports = async ({ pluginRoot }) => {
  const helpers = await import(pathToFileURL(path.join(pluginRoot, 'lib/plugins/service-config-vault/schema-secrets.js')));
  const secret = { kind: 'string', metadata: { sensitive: true } };
  const wrapped = { kind: 'optional', schema: { kind: 'nullable', metadata: { sensitive: true }, schema: { kind: 'string' } } };
  assert.equal(helpers.unwrapSchema(wrapped).kind, 'string');
  assert.equal(helpers.unwrapSchema(wrapped).metadata.sensitive, true);
  assert.equal(helpers.isSensitiveSchema(wrapped), true);
  const schema = { kind: 'object', properties: {
    plain: { kind: 'string' }, wrapped,
    nested: { kind: 'optional', schema: { kind: 'object', properties: { password: secret } } },
    array: { kind: 'array', items: { kind: 'object', properties: { password: secret } } },
    tuple: { kind: 'tuple', elements: [{ kind: 'string' }, secret] },
    record: { kind: 'record', values: secret },
    union: { kind: 'union', schemas: [{ kind: 'object', properties: { password: secret } }] },
    reference: { kind: 'ref', name: 'Credentials' },
  } };
  assert.deepEqual(helpers.sensitiveSchemaPaths(schema), ['wrapped', 'nested.password', 'array', 'tuple', 'record', 'union', 'reference']);
  assert.equal(helpers.isSensitiveSchema({ kind: 'array', items: { kind: 'string' } }), false);
  // The browser editor receives these exact self-contained functions.
  const browserSensitive = new Function('return (' + helpers.isSensitiveSchema.toString() + ')')();
  const browserUnwrap = new Function('return (' + helpers.unwrapSchema.toString() + ')')();
  assert.equal(browserSensitive(schema.properties.array), true);
  assert.equal(browserUnwrap(wrapped).metadata.sensitive, true);
  for (const unwrap of [helpers.unwrapSchema, browserUnwrap]) {
    for (const defaultValue of [null, '', false, 0, 'worker']) {
      const node = { kind: 'optional', default: defaultValue, schema: {
        kind: 'nullable', default: 'inner', inner: { kind: 'string', default: 'leaf' },
      } };
      assert.equal(unwrap(node).default, defaultValue);
      assert.equal(node.schema.default, 'inner');
    }
    assert.equal(unwrap({ kind: 'nullable', inner: { kind: 'string', default: 'leaf' } }).default, 'leaf');
    assert.equal(Object.hasOwn(unwrap(wrapped), 'default'), false);
  }
};
