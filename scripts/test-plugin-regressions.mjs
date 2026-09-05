import { globSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const pluginTests = globSync('plugins/nodejs/*/tests/*.test.ts');
const vaultTests = globSync('plugins/nodejs/config-vault/tests/**/*.cjs');
assert.ok(pluginTests.length, 'No plugin regression tests discovered');
assert.ok(vaultTests.length, 'No Vault regression tests discovered');
for (const file of pluginTests) {
  await import(pathToFileURL(resolve(file)).href);
}
for (const file of vaultTests) {
  test(file, async () => {
    const { default: run } = await import(pathToFileURL(resolve(file)).href);
    await run({ pluginRoot: resolve('plugins/nodejs/config-vault') });
  });
}
