import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { extractSchemaSource } from '../../scripts/extract-schemas-from-source.js';

describe('source schema extraction', () => {
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
  static metadata = { name: 'service-cross-file-schema' };
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
      });
      assert.equal(loaded.__BSB_SCHEMA_RESULT.pluginName, 'service-cross-file-schema');
      assert.equal(loaded.__BSB_SCHEMA_RESULT.version, '1.2.3');
    } finally {
      fs.rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  it('retains aliased imports referenced only by static schema roots', () => {
    const generated = extractSchemaSource(`
import { Config as ImportedConfig, EventSchemas as ImportedEvents } from 'schema-package';
export class Plugin {
  static Config = ImportedConfig;
  static EventSchemas = ImportedEvents;
}
`, 'service-aliased-schema', 'external', process.cwd(), 'file:///base.js', '1.0.0');

    assert.match(generated, /Config as ImportedConfig/);
    assert.match(generated, /_Config = ImportedConfig/);
    assert.match(generated, /_EventSchemas = ImportedEvents/);
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
