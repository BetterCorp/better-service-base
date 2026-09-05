import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('regression runner fails when either required test group is missing', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'bsb-test-discovery-'));
  const runner = fileURLToPath(new URL('./test-plugin-regressions.mjs', import.meta.url));
  try {
    for (const group of ['plugin', 'Vault']) {
      const run = spawnSync(process.execPath, [runner], { cwd, encoding: 'utf8' });
      assert.equal(run.error, undefined);
      assert.equal(run.status, 1);
      assert.match(run.stderr, new RegExp(`No ${group} regression tests discovered`));
      if (group === 'plugin') {
        const tests = join(cwd, 'plugins/nodejs/fixture/tests');
        mkdirSync(tests, { recursive: true });
        writeFileSync(join(tests, 'fixture.test.ts'), '');
      }
    }
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
