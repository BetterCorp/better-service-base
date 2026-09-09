import * as assert from 'node:assert';
import { parseRegistryPluginId } from '../../interfaces/registry-identifiers.js';

describe('Registry client identifiers', () => {
  it('accepts scoped/dotted IDs and rejects traversal or extra segments', () => {
    assert.deepEqual(parseRegistryPluginId('@acme/service.worker'), { org: '@acme', name: 'service.worker' });
    assert.deepEqual(parseRegistryPluginId('service.worker'), { org: '_', name: 'service.worker' });
    for (const id of ['../worker', 'acme/../worker', 'acme/a/b', '/worker', 'acme/', 'a\\b', '%2e%2e/worker', 'worker\n', 'a'.repeat(201)]) {
      assert.throws(() => parseRegistryPluginId(id), /valid name/);
    }
  });
});
