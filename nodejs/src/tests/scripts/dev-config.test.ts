import { describe, it, afterEach } from 'mocha';
import * as assert from 'assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  isDevIgnoredPath,
  readDevConfig,
  resolveDevIgnorePatterns,
} from '../../scripts/dev-config.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'bsb-dev-config-'));
  tempDirs.push(dir);
  return dir;
}

function writePackageJson(dir: string, content: Record<string, unknown>): void {
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(content, null, 2), 'utf-8');
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('dev config', () => {
  it('reads bsb.dev.ignore from package.json', () => {
    const dir = makeTempDir();
    writePackageJson(dir, {
      bsb: {
        dev: {
          ignore: ['generated/**', '', 42],
        },
      },
    });

    assert.deepStrictEqual(readDevConfig(dir), {
      ignore: ['generated/**'],
    });
  });

  it('includes default and configured ignore patterns rooted at cwd', () => {
    const dir = makeTempDir();
    writePackageJson(dir, {
      bsb: {
        dev: {
          ignore: ['src/generated/**'],
        },
      },
    });

    const patterns = resolveDevIgnorePatterns(dir);

    assert.ok(patterns.includes(path.join(dir, 'src', '.bsb').replace(/\\/g, '/')));
    assert.ok(patterns.includes(path.join(dir, '.*', '**').replace(/\\/g, '/')));
    assert.ok(patterns.includes(path.join(dir, '**', '.*', '**').replace(/\\/g, '/')));
    assert.ok(patterns.includes(path.join(dir, 'src', 'generated', '**').replace(/\\/g, '/')));
  });

  it('matches default directories', () => {
    const dir = makeTempDir();
    writePackageJson(dir, {});

    assert.strictEqual(isDevIgnoredPath(dir, path.join(dir, 'node_modules', 'pkg', 'index.js')), true);
    assert.strictEqual(isDevIgnoredPath(dir, path.join(dir, 'src', 'plugins', 'service-x', 'index.ts')), false);
  });

  it('matches root and nested dot-directories by default', () => {
    const dir = makeTempDir();
    writePackageJson(dir, {});

    assert.strictEqual(isDevIgnoredPath(dir, path.join(dir, '.cache', 'state.json')), true);
    assert.strictEqual(isDevIgnoredPath(dir, path.join(dir, 'src', 'plugins', 'service-x', '.cache', 'state.json')), true);
    assert.strictEqual(isDevIgnoredPath(dir, path.join(dir, 'src', 'plugins', 'service-x', '.generated', 'registry.ts')), true);
  });

  it('matches configured dev ignore globs', () => {
    const dir = makeTempDir();
    writePackageJson(dir, {
      bsb: {
        dev: {
          ignore: ['src/generated/**'],
        },
      },
    });

    assert.strictEqual(isDevIgnoredPath(dir, path.join(dir, 'src', 'generated', 'client.ts')), true);
  });
});
