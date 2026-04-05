import { describe, it } from 'mocha';
import * as assert from 'assert';
import * as av from '@anyvali/js';
import { createConfigSchema, BSBPluginConfig } from '../../base/PluginConfig';

describe('PluginConfig', () => {
  it('creates a config class with metadata and schema', () => {
    const schema = av.object({
      setting: av.string(),
    }, { unknownKeys: 'strip' });

    const Config = createConfigSchema(
      {
        name: 'test-plugin',
        description: 'Test plugin description',
        version: '2.0.0',
        category: 'service',
      },
      schema,
    );

    const instance = new Config('', '', '', '');
    assert.ok(instance instanceof BSBPluginConfig);
    assert.strictEqual(Config.metadata.name, 'test-plugin');
    assert.strictEqual(Config.metadata.version, '2.0.0');
    assert.strictEqual(Config.metadata.category, 'service');
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

  it('preserves dependency metadata arrays', () => {
    const Config = createConfigSchema({
      name: 'test-plugin',
      description: 'Test plugin',
      initBeforePlugins: ['plugin-a'],
      initAfterPlugins: ['plugin-b'],
      runBeforePlugins: ['plugin-c'],
      runAfterPlugins: ['plugin-d'],
    });

    assert.deepStrictEqual(Config.metadata.initBeforePlugins, ['plugin-a']);
    assert.deepStrictEqual(Config.metadata.initAfterPlugins, ['plugin-b']);
    assert.deepStrictEqual(Config.metadata.runBeforePlugins, ['plugin-c']);
    assert.deepStrictEqual(Config.metadata.runAfterPlugins, ['plugin-d']);
  });
});
