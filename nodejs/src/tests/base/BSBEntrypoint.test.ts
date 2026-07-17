import * as assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

describe('guardBsbEntrypoint', () => {
  it('rejects direct execution and allows imports', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bsb-entrypoint-'));
    const entry = join(dir, 'plugin.ts');
    const importer = join(dir, 'importer.ts');
    const helper = new URL('../../base/entrypoint.ts', import.meta.url).href;

    try {
      writeFileSync(entry, `import { guardBsbEntrypoint } from ${JSON.stringify(helper)};\nguardBsbEntrypoint(import.meta.url);\n`);
      writeFileSync(importer, `import ${JSON.stringify(pathToFileURL(entry).href)};\n`);

      const direct = spawnSync(process.execPath, ['--import', 'tsx', entry], { encoding: 'utf8' });
      const imported = spawnSync(process.execPath, ['--import', 'tsx', importer], { encoding: 'utf8' });

      assert.notStrictEqual(direct.status, 0);
      assert.match(direct.stderr, /BSB plugin and cannot be executed directly/);
      assert.strictEqual(imported.status, 0, imported.stderr);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});