import { globSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

for (const file of globSync('plugins/nodejs/*/tests/*.test.ts')) {
  await import(pathToFileURL(resolve(file)).href);
}
for (const file of globSync('plugins/nodejs/config-vault/tests/**/*.cjs')) {
  test(file, async () => {
    const { default: run } = await import(pathToFileURL(resolve(file)).href);
    await run({ pluginRoot: resolve('plugins/nodejs/config-vault') });
  });
}
