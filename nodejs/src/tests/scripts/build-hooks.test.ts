import { describe, it, afterEach } from 'mocha';
import * as assert from 'assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  readHooksConfig,
  resolveHookScripts,
  runHook,
  runHookDev,
  VALID_HOOK_NAMES,
  type HookName,
  type HookLogger,
} from '../../scripts/build-hooks.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'bsb-hooks-'));
  tempDirs.push(dir);
  return dir;
}

function writePackageJson(dir: string, content: Record<string, unknown>): void {
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(content, null, 2), 'utf-8');
}

function makeFatalLogger(): HookLogger & { messages: string[] } {
  const messages: string[] = [];
  return {
    messages,
    info: (msg: string) => messages.push(`info:${msg}`),
    success: (msg: string) => messages.push(`success:${msg}`),
    error: (msg: string) => { messages.push(`error:${msg}`); throw new Error(msg); },
    warn: (msg: string) => messages.push(`warn:${msg}`),
  };
}

function makeDevLogger(): { messages: string[]; info: (msg: string) => void; success: (msg: string) => void; warn: (msg: string) => void } {
  const messages: string[] = [];
  return {
    messages,
    info: (msg: string) => messages.push(`info:${msg}`),
    success: (msg: string) => messages.push(`success:${msg}`),
    warn: (msg: string) => messages.push(`warn:${msg}`),
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('build-hooks', () => {
  describe('readHooksConfig', () => {
    it('returns empty object when no bsb key', () => {
      const dir = makeTempDir();
      writePackageJson(dir, { name: 'test', scripts: {} });
      const config = readHooksConfig(dir);
      assert.deepStrictEqual(config, {});
    });

    it('returns empty object when bsb has no hooks', () => {
      const dir = makeTempDir();
      writePackageJson(dir, { name: 'test', bsb: { orgId: 'test' } });
      const config = readHooksConfig(dir);
      assert.deepStrictEqual(config, {});
    });

    it('returns empty object when hooks is not an object', () => {
      const dir = makeTempDir();
      writePackageJson(dir, { name: 'test', bsb: { hooks: 'invalid' } });
      const config = readHooksConfig(dir);
      assert.deepStrictEqual(config, {});
    });

    it('returns hooks config when valid', () => {
      const dir = makeTempDir();
      writePackageJson(dir, {
        name: 'test',
        bsb: {
          hooks: {
            afterSchemas: 'my-script',
            afterCompile: ['script-a', 'script-b'],
          },
        },
      });
      const config = readHooksConfig(dir);
      assert.strictEqual(config.afterSchemas, 'my-script');
      assert.deepStrictEqual(config.afterCompile, ['script-a', 'script-b']);
      assert.strictEqual(config.beforeSchemas, undefined);
    });

    it('returns all hook types when configured', () => {
      const dir = makeTempDir();
      const hooks: Record<string, string> = {};
      for (const name of VALID_HOOK_NAMES) {
        hooks[name] = `script-${name}`;
      }
      writePackageJson(dir, { name: 'test', bsb: { hooks } });
      const config = readHooksConfig(dir);
      for (const name of VALID_HOOK_NAMES) {
        assert.strictEqual(config[name], `script-${name}`);
      }
    });
  });

  describe('resolveHookScripts', () => {
    it('returns empty array when hook not configured', () => {
      const dir = makeTempDir();
      writePackageJson(dir, { name: 'test', scripts: {} });
      const scripts = resolveHookScripts('afterSchemas', dir);
      assert.deepStrictEqual(scripts, []);
    });

    it('resolves single string to array', () => {
      const dir = makeTempDir();
      writePackageJson(dir, {
        name: 'test',
        scripts: { 'gen-types': 'echo gen' },
        bsb: { hooks: { afterSchemas: 'gen-types' } },
      });
      const scripts = resolveHookScripts('afterSchemas', dir);
      assert.deepStrictEqual(scripts, ['gen-types']);
    });

    it('resolves array of scripts', () => {
      const dir = makeTempDir();
      writePackageJson(dir, {
        name: 'test',
        scripts: { 'script-a': 'echo a', 'script-b': 'echo b' },
        bsb: { hooks: { afterCompile: ['script-a', 'script-b'] } },
      });
      const scripts = resolveHookScripts('afterCompile', dir);
      assert.deepStrictEqual(scripts, ['script-a', 'script-b']);
    });

    it('throws on undefined script reference', () => {
      const dir = makeTempDir();
      writePackageJson(dir, {
        name: 'test',
        scripts: {},
        bsb: { hooks: { afterSchemas: 'nonexistent' } },
      });
      assert.throws(
        () => resolveHookScripts('afterSchemas', dir),
        /Hook "afterSchemas" references undefined script "nonexistent"/,
      );
    });

    it('throws on second undefined script in array', () => {
      const dir = makeTempDir();
      writePackageJson(dir, {
        name: 'test',
        scripts: { 'exists': 'echo yes' },
        bsb: { hooks: { afterSchemas: ['exists', 'missing'] } },
      });
      assert.throws(
        () => resolveHookScripts('afterSchemas', dir),
        /Hook "afterSchemas" references undefined script "missing"/,
      );
    });

    it('skips empty strings and non-string entries', () => {
      const dir = makeTempDir();
      writePackageJson(dir, {
        name: 'test',
        scripts: { 'valid': 'echo ok' },
        bsb: { hooks: { afterSchemas: ['', '  ', 'valid'] } },
      });
      const scripts = resolveHookScripts('afterSchemas', dir);
      assert.deepStrictEqual(scripts, ['valid']);
    });

    it('skips empty strings in non-array form', () => {
      const dir = makeTempDir();
      writePackageJson(dir, {
        name: 'test',
        scripts: {},
        bsb: { hooks: { afterSchemas: '' } },
      });
      const scripts = resolveHookScripts('afterSchemas', dir);
      assert.deepStrictEqual(scripts, []);
    });

    it('works when scripts key is missing from package.json', () => {
      const dir = makeTempDir();
      writePackageJson(dir, {
        name: 'test',
        bsb: { hooks: { afterSchemas: 'some-script' } },
      });
      assert.throws(
        () => resolveHookScripts('afterSchemas', dir),
        /undefined script "some-script"/,
      );
    });
  });

  describe('runHook (build mode)', () => {
    it('does nothing when no hooks configured', () => {
      const dir = makeTempDir();
      writePackageJson(dir, { name: 'test', scripts: {} });
      const logger = makeFatalLogger();
      runHook('afterSchemas', dir, logger);
      assert.deepStrictEqual(logger.messages, []);
    });

    it('runs a configured script successfully', () => {
      const dir = makeTempDir();
      const markerFile = path.join(dir, 'hook-ran.txt');
      writePackageJson(dir, {
        name: 'test',
        scripts: { 'test-hook': `node -e "require('fs').writeFileSync('${markerFile.replace(/\\/g, '\\\\')}', 'ok')"` },
        bsb: { hooks: { afterSchemas: 'test-hook' } },
      });
      const logger = makeFatalLogger();
      runHook('afterSchemas', dir, logger);
      assert.ok(fs.existsSync(markerFile), 'Hook script should have created marker file');
      assert.strictEqual(fs.readFileSync(markerFile, 'utf-8'), 'ok');
      assert.ok(logger.messages.some(m => m.includes('info:') && m.includes('afterSchemas')));
      assert.ok(logger.messages.some(m => m.includes('success:') && m.includes('afterSchemas')));
    });

    it('calls error on undefined script (fatal)', () => {
      const dir = makeTempDir();
      writePackageJson(dir, {
        name: 'test',
        scripts: {},
        bsb: { hooks: { beforeCompile: 'missing' } },
      });
      const logger = makeFatalLogger();
      assert.throws(
        () => runHook('beforeCompile', dir, logger),
        /undefined script "missing"/,
      );
    });

    it('calls error on script execution failure (fatal)', () => {
      const dir = makeTempDir();
      writePackageJson(dir, {
        name: 'test',
        scripts: { 'fail-hook': 'exit 1' },
        bsb: { hooks: { afterCompile: 'fail-hook' } },
      });
      const logger = makeFatalLogger();
      assert.throws(
        () => runHook('afterCompile', dir, logger),
        /Failed to run hook/,
      );
    });

    it('runs multiple scripts in order', () => {
      const dir = makeTempDir();
      const logFile = path.join(dir, 'order.txt');
      const escaped = logFile.replace(/\\/g, '\\\\');
      writePackageJson(dir, {
        name: 'test',
        scripts: {
          'hook-1': `node -e "require('fs').appendFileSync('${escaped}', '1\\n')"`,
          'hook-2': `node -e "require('fs').appendFileSync('${escaped}', '2\\n')"`,
        },
        bsb: { hooks: { afterSchemas: ['hook-1', 'hook-2'] } },
      });
      const logger = makeFatalLogger();
      runHook('afterSchemas', dir, logger);
      const content = fs.readFileSync(logFile, 'utf-8').trim();
      assert.strictEqual(content, '1\n2');
    });
  });

  describe('runHookDev (dev mode)', () => {
    it('returns true when no hooks configured', () => {
      const dir = makeTempDir();
      writePackageJson(dir, { name: 'test', scripts: {} });
      const logger = makeDevLogger();
      const result = runHookDev('afterSchemas', dir, logger);
      assert.strictEqual(result, true);
    });

    it('returns true and runs script on success', () => {
      const dir = makeTempDir();
      const markerFile = path.join(dir, 'dev-hook-ran.txt');
      writePackageJson(dir, {
        name: 'test',
        scripts: { 'dev-hook': `node -e "require('fs').writeFileSync('${markerFile.replace(/\\/g, '\\\\')}', 'dev-ok')"` },
        bsb: { hooks: { beforeCompile: 'dev-hook' } },
      });
      const logger = makeDevLogger();
      const result = runHookDev('beforeCompile', dir, logger);
      assert.strictEqual(result, true);
      assert.ok(fs.existsSync(markerFile));
    });

    it('returns false on undefined script (non-fatal)', () => {
      const dir = makeTempDir();
      writePackageJson(dir, {
        name: 'test',
        scripts: {},
        bsb: { hooks: { afterSchemas: 'missing' } },
      });
      const logger = makeDevLogger();
      const result = runHookDev('afterSchemas', dir, logger);
      assert.strictEqual(result, false);
      assert.ok(logger.messages.some(m => m.includes('warn:')));
    });

    it('returns false on script execution failure (non-fatal)', () => {
      const dir = makeTempDir();
      writePackageJson(dir, {
        name: 'test',
        scripts: { 'fail-hook': 'exit 1' },
        bsb: { hooks: { afterCompile: 'fail-hook' } },
      });
      const logger = makeDevLogger();
      const result = runHookDev('afterCompile', dir, logger);
      assert.strictEqual(result, false);
      assert.ok(logger.messages.some(m => m.includes('warn:') && m.includes('Failed')));
    });

    it('stops on first failure in array', () => {
      const dir = makeTempDir();
      const markerFile = path.join(dir, 'second-ran.txt');
      const escaped = markerFile.replace(/\\/g, '\\\\');
      writePackageJson(dir, {
        name: 'test',
        scripts: {
          'fail-first': 'exit 1',
          'should-not-run': `node -e "require('fs').writeFileSync('${escaped}', 'bad')"`,
        },
        bsb: { hooks: { afterSchemas: ['fail-first', 'should-not-run'] } },
      });
      const logger = makeDevLogger();
      const result = runHookDev('afterSchemas', dir, logger);
      assert.strictEqual(result, false);
      assert.ok(!fs.existsSync(markerFile), 'Second script should not run after first fails');
    });
  });

  describe('VALID_HOOK_NAMES', () => {
    it('contains all 6 hook names', () => {
      assert.strictEqual(VALID_HOOK_NAMES.length, 6);
      assert.ok(VALID_HOOK_NAMES.includes('beforeSchemas'));
      assert.ok(VALID_HOOK_NAMES.includes('afterSchemas'));
      assert.ok(VALID_HOOK_NAMES.includes('beforeCompile'));
      assert.ok(VALID_HOOK_NAMES.includes('afterCompile'));
      assert.ok(VALID_HOOK_NAMES.includes('afterBuild'));
      assert.ok(VALID_HOOK_NAMES.includes('beforeDev'));
    });
  });
});
