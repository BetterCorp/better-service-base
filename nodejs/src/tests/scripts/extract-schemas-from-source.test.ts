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
