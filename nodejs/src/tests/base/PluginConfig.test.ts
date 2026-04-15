import { describe, it } from 'mocha';
import * as assert from 'assert';
import * as av from '@anyvali/js';
import { createConfigSchema, BSBPluginConfig } from '../../base/PluginConfig.js';

describe('PluginConfig', () => {
  it('creates a config class with metadata and schema', () => {
    const schema = av.object({
      setting: av.string(),
    }, { unknownKeys: 'strip' });

    const Config = createConfigSchema(
      {
        name: 'test-plugin',
        description: 'Test plugin description',
        tags: ['test', 'example'],
      },
      schema,
    );

    const instance = new Config('', '', '', '');
    assert.ok(instance instanceof BSBPluginConfig);
    assert.strictEqual(Config.metadata.name, 'test-plugin');
    assert.deepStrictEqual(Config.metadata.tags, ['test', 'example']);
    assert.strictEqual(instance.validationSchema, schema);
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
