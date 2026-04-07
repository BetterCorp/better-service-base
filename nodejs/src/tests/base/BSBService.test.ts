import { describe, it } from 'mocha';
import * as assert from 'assert';
import * as av from '@anyvali/js';
import { BSBService } from '../../base/BSBService.js';
import { createConfigSchema } from '../../base/PluginConfig.js';
import { createEventSchemas, createFireAndForgetEvent, createReturnableEvent } from '../../interfaces/schema-events.js';

describe('BSBService', () => {
  const Config = createConfigSchema(
    {
      name: 'test-service',
      description: 'Test service',
      version: '2.1.0',
      initBeforePlugins: ['plugin-a'],
    },
    av.optional(av.object({}, { unknownKeys: 'strip' })).default({}),
  );

  const EventSchemas = createEventSchemas({
    emitEvents: {
      'test.event': createFireAndForgetEvent(av.object({
        id: av.string(),
      }, { unknownKeys: 'strip' }), 'Test event'),
    },
    emitReturnableEvents: {
      'test.returnable': createReturnableEvent(
        av.object({ input: av.string() }, { unknownKeys: 'strip' }),
        av.object({ output: av.int32() }, { unknownKeys: 'strip' }),
        'Returnable event',
      ),
    },
  });

  class TestPlugin extends BSBService<InstanceType<typeof Config>, typeof EventSchemas> {
    static Config = Config;
    static EventSchemas = EventSchemas;

    public initBeforePlugins?: string[] | undefined;
    public initAfterPlugins?: string[] | undefined;
    public runBeforePlugins?: string[] | undefined;
    public runAfterPlugins?: string[] | undefined;

    constructor(config: any) {
      super(config);
    }

    init?(): void | Promise<void>;
    run?(): void | Promise<void>;
    dispose?(): void;
  }

  it('auto-generates PLUGIN_CLIENT from config metadata', () => {
    assert.strictEqual(TestPlugin.PLUGIN_CLIENT.name, 'test-service');
    assert.deepStrictEqual(TestPlugin.PLUGIN_CLIENT.initBeforePlugins, ['plugin-a']);
  });

  it('exports event schemas using AnyVali documents', () => {
    const exported = TestPlugin.exportSchemas();
    const event = exported.events['test.event'];

    assert.strictEqual(exported.pluginName, 'test-service');
    assert.strictEqual(exported.version, '2.1.0');
    assert.strictEqual(event.type, 'fire-and-forget');
    assert.strictEqual(event.inputSchema.root.kind, 'object');
    assert.ok('id' in (event.inputSchema.root.kind === 'object' ? event.inputSchema.root.properties : {}));
  });

  it('throws when static Config is missing', () => {
    class BrokenPlugin extends BSBService<any, typeof EventSchemas> {
      static EventSchemas = EventSchemas;

      public initBeforePlugins?: string[] | undefined;
      public initAfterPlugins?: string[] | undefined;
      public runBeforePlugins?: string[] | undefined;
      public runAfterPlugins?: string[] | undefined;

      init?(): void | Promise<void>;
      run?(): void | Promise<void>;
      dispose?(): void;
    }

    assert.throws(() => BrokenPlugin.PLUGIN_CLIENT, /static Config property/);
  });
});
