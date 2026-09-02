import * as assert from 'assert';
import * as av from 'anyvali';
import { createConfigSchema, BSBPluginConfig } from '../../base/PluginConfig.js';

describe('PluginConfig', () => {
  it('creates a config class with metadata and schema', () => {
    const schema = av.object({
      setting: av.string(),
      database: av.object({
        host: av.string(),
        replicas: av.array(av.string()),
      }),
    }, { unknownKeys: 'strip' });

    const Config = createConfigSchema(
      {
        name: 'test-plugin',
        description: 'Test plugin description',
        tags: ['test', 'example'],
        envOverridePaths: ['setting', 'database.host', 'database.replicas'],
      },
      schema,
    );

    const instance = new Config('', '', '', '');
    assert.ok(instance instanceof BSBPluginConfig);
    assert.strictEqual(Config.metadata.name, 'test-plugin');
    assert.deepStrictEqual(Config.metadata.tags, ['test', 'example']);
    assert.deepStrictEqual(Config.metadata.envOverridePaths, ['setting', 'database.host', 'database.replicas']);
    assert.strictEqual(instance.validationSchema, schema);

    createConfigSchema(
      {
        name: 'invalid-override-path',
        description: 'Compile-time path validation',
        // @ts-expect-error env override paths must exist in the config schema
        envOverridePaths: ['database.missing'],
      },
      schema,
    );
  });

  it('supports config classes without a validation schema', () => {
    const Config = createConfigSchema({
      name: 'test-no-config',
      description: 'No config',
    });

    const instance = new Config('', '', '', '');
    assert.strictEqual(instance.validationSchema, undefined);
    assert.strictEqual(instance.metadata?.name, 'test-no-config');
  });

  it('preserves supported metadata fields', () => {
    const Config = createConfigSchema({
      name: 'test-plugin',
      description: 'Test plugin',
      homepage: 'https://example.com',
      repository: 'https://example.com/repo.git',
      image: './plugin.png',
    });

    assert.strictEqual(Config.metadata.homepage, 'https://example.com');
    assert.strictEqual(Config.metadata.repository, 'https://example.com/repo.git');
    assert.strictEqual(Config.metadata.image, './plugin.png');
  });
});
