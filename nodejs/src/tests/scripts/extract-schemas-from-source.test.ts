import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { extractSchemaSource } from '../../scripts/extract-schemas-from-source.js';

describe('source schema extraction', () => {
  it('evaluates schemas using shared language identifiers', async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsb-schema-language-'));
    try {
      fs.writeFileSync(path.join(sourceDir, 'base.ts'), `
export const PLUGIN_LANGUAGES = ['nodejs', 'csharp', 'python'];
export const exportEventSchemas = (_name: string, events: unknown) => ({ events });
`);
      const generated = extractSchemaSource(`
import { PLUGIN_LANGUAGES } from '@bsb/base';
export const EventSchemas = { languages: [...PLUGIN_LANGUAGES] };
export class Plugin { static EventSchemas = EventSchemas; }
`, 'service-languages', 'external', sourceDir, pathToFileURL(path.join(sourceDir, 'base.ts')).href, '1.0.0');
      const target = path.join(sourceDir, 'extract.ts');
      fs.writeFileSync(target, generated);
      const loaded = await import(pathToFileURL(target).href);
      assert.deepStrictEqual(loaded.__BSB_SCHEMA_RESULT.events.languages, ['nodejs', 'csharp', 'python']);
    } finally { fs.rmSync(sourceDir, { recursive: true, force: true }); }
  });

  it('loads static schema roots from another file and its transitive imports', async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsb-schema-source-'));
    try {
      fs.writeFileSync(path.join(sourceDir, 'schema-value.ts'), `
export const validationSchema = {
  export: () => ({ root: { kind: 'object', properties: { enabled: { kind: 'bool' } } } }),
};
`);
      fs.writeFileSync(path.join(sourceDir, 'config.ts'), `
import { validationSchema } from './schema-value.js';
export class Config {
  static metadata = { id: 'service-cross-file-schema', name: 'Cross File Schema', envOverridePaths: ['enabled'] };
  validationSchema = validationSchema;
}
export const EventSchemas = {};
`);
      fs.writeFileSync(path.join(sourceDir, 'base.ts'), `
export function exportEventSchemas(pluginName: string) {
  return { pluginName, events: {} };
}
`);
      const source = `
import * as Schemas from './config.js';
import { BSBService } from '@bsb/base';
export class Plugin extends BSBService {
  static Config = Schemas.Config;
  static EventSchemas = Schemas.EventSchemas;
}
`;
      const generated = extractSchemaSource(
        source,
        'service-cross-file-schema',
        'external',
        sourceDir,
        pathToFileURL(path.join(sourceDir, 'base.ts')).href,
        '1.2.3',
      );
      assert.match(generated, /import \* as Schemas from '.\/config\.ts'/);
      assert.match(generated, /_Config = Schemas\.Config/);

      const generatedPath = path.join(sourceDir, 'extract.ts');
      fs.writeFileSync(generatedPath, generated);
      const loaded = await import(`${pathToFileURL(generatedPath).href}?t=${Date.now()}`) as {
        __BSB_SCHEMA_RESULT: Record<string, unknown>;
      };
      assert.deepStrictEqual(loaded.__BSB_SCHEMA_RESULT.configSchema, {
        root: { kind: 'object', properties: { enabled: { kind: 'bool' } } },
        extensions: { bsb: { envOverridePaths: ['enabled'] } },
      });
      assert.equal(loaded.__BSB_SCHEMA_RESULT.pluginId, 'service-cross-file-schema');
      assert.equal(loaded.__BSB_SCHEMA_RESULT.pluginName, 'service-cross-file-schema');
      assert.equal(loaded.__BSB_SCHEMA_RESULT.displayName, 'Cross File Schema');
      assert.equal(loaded.__BSB_SCHEMA_RESULT.version, '1.2.3');
    } finally {
      fs.rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  it('rejects package imports referenced by static schema roots', () => {
    assert.throws(() => extractSchemaSource(`
import { Config as ImportedConfig, EventSchemas as ImportedEvents } from 'schema-package';
export class Plugin {
  static Config = ImportedConfig;
  static EventSchemas = ImportedEvents;
}
`, 'service-aliased-schema', 'external', process.cwd(), 'file:///base.js', '1.0.0'), /refused package import/);
  });

  it('drops package imports referenced only by TypeScript types', () => {
    const generated = extractSchemaSource(`
import runtimePackage from 'runtime-package';
type RuntimeValue = runtimePackage.Value;
export const Config = {};
export class Plugin { static Config = Config; }
`, 'service-type-only-package', 'external', process.cwd(), 'file:///base.js', '1.0.0');
    assert.doesNotMatch(generated, /runtime-package/);
  });

  it('drops package imports referenced only by unused runtime helpers', () => {
    const generated = extractSchemaSource(`
import runtimePackage from 'runtime-package';
function runtimeOnly() { return runtimePackage.value; }
export const Config = {};
export class Plugin { static Config = Config; run() { return runtimeOnly(); } }
`, 'service-runtime-helper', 'external', process.cwd(), 'file:///base.js', '1.0.0');
    assert.doesNotMatch(generated, /import runtimePackage/);
  });

  it('rejects top-level and imported side effects before evaluation', () => {
    assert.throws(() => extractSchemaSource(`
writeFileSync('/tmp/schema-extraction-ran', 'unsafe');
export class Plugin {}
`, 'service-side-effect', 'external', process.cwd(), 'file:///base.js', '1.0.0'), /executable top-level statement/);

    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsb-schema-side-effect-'));
    try {
      fs.writeFileSync(path.join(sourceDir, 'unsafe.ts'), `
export const Config = {};
writeFileSync('/tmp/schema-extraction-import-ran', 'unsafe');
`);
      assert.throws(() => extractSchemaSource(`
import { Config } from './unsafe.js';
export class Plugin { static Config = Config; }
`, 'service-import-side-effect', 'external', sourceDir, 'file:///base.js', '1.0.0'), /executable top-level statement/);

      fs.writeFileSync(path.join(sourceDir, 'unsafe-reexport.mjs'), `
export class ReexportedConfig {}
writeFileSync('/tmp/schema-reexport-ran', 'unsafe');
`);
      fs.writeFileSync(path.join(sourceDir, 'bridge.ts'), `
export { ReexportedConfig as Config } from './unsafe-reexport.mjs';
`);
      assert.throws(() => extractSchemaSource(`
import { Config } from './bridge.js';
export class Plugin { static Config = Config; }
`, 'service-reexport-side-effect', 'external', sourceDir, 'file:///base.js', '1.0.0'), /executable top-level statement/);
    } finally {
      fs.rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  it('rejects constructor-chain calls and deceptively named imports', () => {
    assert.throws(() => extractSchemaSource(`
import { bsb } from '@bsb/base';
export const Config = bsb.constructor.constructor('process.exit(1)')();
export class Plugin { static Config = Config; }
`, 'service-constructor-chain', 'external', process.cwd(), 'file:///base.js', '1.0.0'), /refused call/);

    assert.throws(() => extractSchemaSource(`
import { Config } from 'evil-schema-types';
export class Plugin { static Config = Config; }
`, 'service-deceptive-import', 'external', process.cwd(), 'file:///base.js', '1.0.0'), /refused package import/);

    assert.throws(() => extractSchemaSource(`
import * as os from 'node:os';
export const Config = os.setPriority(0, -1);
export class Plugin { static Config = Config; }
`, 'service-unsafe-os-call', 'external', process.cwd(), 'file:///base.js', '1.0.0'), /refused call/);
  });

  it('rejects executable config construction and imported helper bodies', () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsb-schema-construction-'));
    try {
      fs.writeFileSync(path.join(sourceDir, 'unsafe-config.ts'), `
export function make() { return fetch('https://example.invalid'); }
export class Config { validationSchema = make(); }
`);
      assert.throws(() => extractSchemaSource(`
import { Config } from './unsafe-config.js';
export class Plugin { static Config = Config; }
`, 'service-unsafe-config', 'external', sourceDir, 'file:///base.js', '1.0.0'), /refused call/);
    } finally {
      fs.rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  it('rejects binding defaults and shadowed callable names', () => {
    assert.throws(() => extractSchemaSource(`
const { value = process.exit(1) } = {};
export const Config = {};
export class Plugin { static Config = Config; }
`, 'service-binding-default', 'external', process.cwd(), 'file:///base.js', '1.0.0'), /refused call/);

    assert.throws(() => extractSchemaSource(`
function helper(bsb: unknown) { return (bsb as Function)(process.env, 'BSB_REVIEW_EXECUTED', 'yes'); }
export const Config = helper(Reflect.set);
export class Plugin { static Config = Config; }
`, 'service-shadowed-call', 'external', process.cwd(), 'file:///base.js', '1.0.0'), /shadowed callable binding/);

    assert.throws(() => extractSchemaSource(`
function helper() { return Reflect.set; }
export const Config = helper()(process.env, 'BSB_REVIEW_EXECUTED', 'yes');
export class Plugin { static Config = Config; }
`, 'service-returned-callable', 'external', process.cwd(), 'file:///base.js', '1.0.0'), /refused call/);
  });

  it('rejects unvalidated static methods on local imports', () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsb-schema-static-method-'));
    try {
      fs.writeFileSync(path.join(sourceDir, 'factory.ts'), `
export class Factory { static make() { return fetch('https://example.invalid'); } }
export function helper() { return Reflect.set; }
export function getFactory() { return Factory; }
`);
      fs.writeFileSync(path.join(sourceDir, 'alias.ts'), 'export const run = Reflect.set;\n');
      assert.throws(() => extractSchemaSource(`
import { Factory } from './factory.js';
export const Config = Factory.make();
export class Plugin { static Config = Config; }
`, 'service-static-method', 'external', sourceDir, 'file:///base.js', '1.0.0'), /refused call/);

      assert.throws(() => extractSchemaSource(`
import * as Local from './factory.js';
export const Config = Local.helper()(process.env, 'BSB_REVIEW_EXECUTED', 'yes');
export class Plugin { static Config = Config; }
`, 'service-namespace-returned-callable', 'external', sourceDir, 'file:///base.js', '1.0.0'), /refused call/);

      assert.throws(() => extractSchemaSource(`
import * as Local from './factory.js';
export const Config = Local.getFactory().make();
export class Plugin { static Config = Config; }
`, 'service-namespace-returned-factory', 'external', sourceDir, 'file:///base.js', '1.0.0'), /refused call/);

      assert.throws(() => extractSchemaSource(`
import { run } from './alias.js';
export const Config = run(process.env, 'BSB_REVIEW_EXECUTED', 'yes');
export class Plugin { static Config = Config; }
`, 'service-imported-callable-alias', 'external', sourceDir, 'file:///base.js', '1.0.0'), /refused call/);
    } finally {
      fs.rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  it('retains local imports used by class extends clauses', () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsb-schema-extends-'));
    try {
      fs.writeFileSync(path.join(sourceDir, 'base-config.ts'), 'export class BaseConfig {}\n');
      const generated = extractSchemaSource(`
import { BaseConfig } from './base-config.js';
export class Config extends BaseConfig {}
export class Plugin { static Config = Config; }
`, 'service-extends', 'external', sourceDir, 'file:///base.js', '1.0.0');
      assert.match(generated, /import \{ BaseConfig \} from '.\/base-config\.ts'/);
    } finally {
      fs.rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  it('rejects assignment expressions in schema initializers and accessors', () => {
    assert.throws(() => extractSchemaSource(`
export class Config {
  validationSchema = (process.env.BSB_REVIEW_EXECUTED = 'yes', {});
}
export class Plugin { static Config = Config; }
`, 'service-assignment-side-effect', 'external', process.cwd(), 'file:///base.js', '1.0.0'), /assignment expression/);
  });

  it('rejects executable methods reachable through the extracted config schema', () => {
    assert.throws(() => extractSchemaSource(`
export class Config {
  validationSchema = this;
  export() { process.env.BSB_REVIEW_EXECUTED = 'yes'; return {}; }
}
export class Plugin { static Config = Config; }
`, 'service-method-side-effect', 'external', process.cwd(), 'file:///base.js', '1.0.0'), /executable helper statement/);

    assert.throws(() => extractSchemaSource(`
export class Config {
  validationSchema = this;
  ['ex' + 'port']() { process.env.BSB_REVIEW_EXECUTED = 'yes'; return {}; }
}
export class Plugin { static Config = Config; }
`, 'service-computed-method-side-effect', 'external', process.cwd(), 'file:///base.js', '1.0.0'), /executable helper statement/);

    assert.throws(() => extractSchemaSource(`
export class Config {
  static toString() { process.env.BSB_REVIEW_EXECUTED = 'yes'; return ''; }
}
export const EventSchemas = { description: '' + Config };
export class Plugin { static Config = Config; static EventSchemas = EventSchemas; }
`, 'service-coercion-side-effect', 'external', process.cwd(), 'file:///base.js', '1.0.0'), /executable helper statement/);

    assert.throws(() => extractSchemaSource(`
export class Iter {
  static [Symbol.iterator]() { return { next: this.next }; }
  static next() { process.env.BSB_REVIEW_EXECUTED = 'yes'; return { done: true }; }
}
export const EventSchemas = { description: [...Iter] };
export class Plugin { static EventSchemas = EventSchemas; }
`, 'service-iterator-side-effect', 'external', process.cwd(), 'file:///base.js', '1.0.0'), /executable helper statement/);
  });

  it('rejects decorators that execute while defining extracted classes', () => {
    assert.throws(() => extractSchemaSource(`
function decorate(value: unknown) { return value; }
@decorate
export class Config {}
export class Plugin { static Config = Config; }
`, 'service-decorated-config', 'external', process.cwd(), 'file:///base.js', '1.0.0'), /refused a decorator/);
  });

  it('rejects executable static schema expressions but permits schema-less plugins', () => {
    assert.throws(() => extractSchemaSource(`
export class Plugin {
  static Config = makeConfig();
}
`, 'service-invalid-schema', 'external', process.cwd(), 'file:///base.js', '1.0.0'), /must reference an identifier or namespace member/);

    const generated = extractSchemaSource('export class Plugin {}', 'service-no-schema', 'external', process.cwd(), 'file:///base.js', '1.0.0');
    assert.match(generated, /eval\('Config'\)/);
  });
});
