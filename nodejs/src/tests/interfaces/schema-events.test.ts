/**
 * Tests for schema-events.ts - v9 features
 */

import { describe, it } from 'mocha';
import * as assert from 'assert';
import {
  createEventSchemas,
  createFireAndForgetEvent,
  createReturnableEvent,
  createBroadcastEvent,
  exportEventSchemas,
} from '../../interfaces/schema-events.js';
import { bsb } from '../../interfaces/schema-types.js';

describe('schema-events v9', () => {
  function createEventSchemasWithoutDevWarnings<const T extends Parameters<typeof createEventSchemas>[0]>(
    schemas: T
  ): T {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      return createEventSchemas(schemas);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  }

  describe('createEventSchemas', () => {
    it('should create event schemas without requiring "as const"', () => {
      const schemas = createEventSchemas({
        emitEvents: {
          'test.event': createFireAndForgetEvent(bsb.string(), 'Test event'),
        },
      });

      assert.ok(schemas.emitEvents);
      assert.ok(schemas.emitEvents['test.event']);
      assert.strictEqual(schemas.emitEvents['test.event'].description, 'Test event');
    });

    it('should preserve const type parameter for type inference', () => {
      const schemas = createEventSchemas({
        emitEvents: {
          'test.event': createFireAndForgetEvent(bsb.object({ id: bsb.string() }), 'Test event'),
        },
      });

      assert.ok(schemas.emitEvents);
      assert.ok(schemas.emitEvents['test.event']);
      assert.strictEqual(schemas.emitEvents['test.event'].__brand, 'fire-and-forget');
    });

    it('should warn about duplicate event names across categories in dev mode', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const consoleWarnCalls: string[] = [];
      const originalWarn = console.warn;
      console.warn = (message: string) => {
        consoleWarnCalls.push(message);
      };

      try {
        createEventSchemas({
          emitEvents: {
            'duplicate.event': createFireAndForgetEvent(bsb.string(), 'Event 1'),
          },
          emitReturnableEvents: {
            'duplicate.event': createReturnableEvent(bsb.string(), bsb.int32(), 'Event 2'),
          },
        });

        assert.ok(consoleWarnCalls.some((msg) => msg.includes('duplicate.event')));
        assert.ok(consoleWarnCalls.some((msg) => msg.includes('Duplicate event names detected')));
      } finally {
        console.warn = originalWarn;
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('should not warn in production mode', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const consoleWarnCalls: string[] = [];
      const originalWarn = console.warn;
      console.warn = (message: string) => {
        consoleWarnCalls.push(message);
      };

      try {
        createEventSchemas({
          emitEvents: {
            'duplicate.event': createFireAndForgetEvent(bsb.string(), 'Event 1'),
          },
          emitReturnableEvents: {
            'duplicate.event': createReturnableEvent(bsb.string(), bsb.int32(), 'Event 2'),
          },
        });

        assert.strictEqual(consoleWarnCalls.length, 0);
      } finally {
        console.warn = originalWarn;
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('should handle all event categories', () => {
      const schemas = createEventSchemas({
        emitEvents: {
          'emit.event': createFireAndForgetEvent(bsb.string(), 'Emit event'),
        },
        emitReturnableEvents: {
          'emit.returnable': createReturnableEvent(bsb.string(), bsb.int32(), 'Emit returnable'),
        },
        onReturnableEvents: {
          'on.returnable': createReturnableEvent(bsb.string(), bsb.boolean(), 'On returnable'),
        },
        onEvents: {
          'on.event': createFireAndForgetEvent(bsb.int32(), 'On event'),
        },
        emitBroadcast: {
          'broadcast.event': createBroadcastEvent(bsb.object({ msg: bsb.string() }), 'Broadcast event'),
        },
      });

      assert.ok(schemas.emitEvents);
      assert.ok(schemas.emitReturnableEvents);
      assert.ok(schemas.onReturnableEvents);
      assert.ok(schemas.onEvents);
      assert.ok(schemas.emitBroadcast);
    });
  });

  describe('Event type branding', () => {
    it('should add __brand to fire-and-forget events', () => {
      const event = createFireAndForgetEvent(bsb.string(), 'Test event');
      assert.strictEqual(event.__brand, 'fire-and-forget');
    });

    it('should add __brand to returnable events', () => {
      const event = createReturnableEvent(bsb.string(), bsb.int32(), 'Test event');
      assert.strictEqual(event.__brand, 'returnable');
    });

    it('should add __brand to broadcast events', () => {
      const event = createBroadcastEvent(bsb.string(), 'Test event');
      assert.strictEqual(event.__brand, 'broadcast');
    });
  });

  describe('exportEventSchemas', () => {
    it('should export event schemas to AnyVali documents', () => {
      const schemas = createEventSchemas({
        emitEvents: {
          'test.event': createFireAndForgetEvent(bsb.object({ id: bsb.string() }), 'Test event'),
        },
      });

      const exported = exportEventSchemas('test-plugin', schemas);

      assert.strictEqual(exported.pluginName, 'test-plugin');
      assert.strictEqual(exported.version, undefined);
      assert.ok(exported.events['test.event']);
      assert.strictEqual(exported.events['test.event'].type, 'fire-and-forget');
      assert.strictEqual(exported.events['test.event'].category, 'emitEvents');
      assert.strictEqual(exported.events['test.event'].description, 'Test event');
    });

    it('should export returnable events with input and output schemas', () => {
      const schemas = createEventSchemas({
        emitReturnableEvents: {
          'test.returnable': createReturnableEvent(
            bsb.object({ input: bsb.string() }),
            bsb.object({ output: bsb.int32() }),
            'Returnable event'
          ),
        },
      });

      const exported = exportEventSchemas('test-plugin', schemas);

      assert.ok(exported.events['test.returnable']);
      assert.strictEqual(exported.events['test.returnable'].type, 'returnable');
      assert.ok(exported.events['test.returnable'].inputSchema);
      assert.ok(exported.events['test.returnable'].outputSchema);
      assert.notStrictEqual(exported.events['test.returnable'].outputSchema, null);
    });

    it('should export broadcast events', () => {
      const schemas = createEventSchemas({
        emitBroadcast: {
          'test.broadcast': createBroadcastEvent(bsb.object({ message: bsb.string() }), 'Broadcast event'),
        },
      });

      const exported = exportEventSchemas('test-plugin', schemas);

      assert.ok(exported.events['test.broadcast']);
      assert.strictEqual(exported.events['test.broadcast'].type, 'broadcast');
      assert.ok(exported.events['test.broadcast'].inputSchema);
      assert.strictEqual(exported.events['test.broadcast'].outputSchema, null);
    });

    it('should handle multiple events across categories', () => {
      const schemas = createEventSchemas({
        emitEvents: {
          'event1': createFireAndForgetEvent(bsb.string(), 'Event 1'),
        },
        emitReturnableEvents: {
          'event2': createReturnableEvent(bsb.string(), bsb.int32(), 'Event 2'),
        },
        onEvents: {
          'event3': createFireAndForgetEvent(bsb.boolean(), 'Event 3'),
        },
      });

      const exported = exportEventSchemas('test-plugin', schemas);

      assert.strictEqual(Object.keys(exported.events).length, 3);
      assert.ok(exported.events['event1']);
      assert.ok(exported.events['event2']);
      assert.ok(exported.events['event3']);
    });

    it('should fail export when a plugin emits and listens to the same fire-and-forget event', () => {
      const schemas = createEventSchemasWithoutDevWarnings({
        emitEvents: {
          'platform-config.changed': createFireAndForgetEvent(bsb.string(), 'Event emitted by this plugin'),
        },
        onEvents: {
          'platform-config.changed': createFireAndForgetEvent(bsb.string(), 'Event handled by this plugin'),
        },
      });

      assert.throws(
        () => exportEventSchemas('service-config-manager', schemas),
        (error: unknown) => {
          const message = (error as Error).message;
          assert.ok(message.includes('[BSB Build Error]'));
          assert.ok(message.includes('"service-config-manager"'));
          assert.ok(message.includes('"platform-config.changed"'));
          assert.ok(message.includes('emitEvents'));
          assert.ok(message.includes('onEvents'));
          assert.ok(message.includes('Each event name must be unique'));
          assert.ok(message.includes('ServiceClient'));
          assert.ok(message.includes('client onEvent API'));
          return true;
        }
      );
    });

    it('should fail export when a plugin emits and listens to the same returnable event', () => {
      const schemas = createEventSchemasWithoutDevWarnings({
        emitReturnableEvents: {
          'platform-config.changed': createReturnableEvent(
            bsb.string(),
            bsb.boolean(),
            'Returnable event emitted by this plugin'
          ),
        },
        onReturnableEvents: {
          'platform-config.changed': createReturnableEvent(
            bsb.string(),
            bsb.boolean(),
            'Returnable event handled by this plugin'
          ),
        },
      });

      assert.throws(
        () => exportEventSchemas('service-config-manager', schemas),
        (error: unknown) => {
          const message = (error as Error).message;
          assert.ok(message.includes('"platform-config.changed"'));
          assert.ok(message.includes('emitReturnableEvents'));
          assert.ok(message.includes('onReturnableEvents'));
          assert.ok(message.includes('client onReturnableEvent API'));
          return true;
        }
      );
    });

    it('should fail export when a plugin emits and listens to the same broadcast event', () => {
      const schemas = createEventSchemasWithoutDevWarnings({
        emitBroadcast: {
          'platform-config.changed': createBroadcastEvent(bsb.string(), 'Broadcast emitted by this plugin'),
        },
        onBroadcast: {
          'platform-config.changed': createBroadcastEvent(bsb.string(), 'Broadcast handled by this plugin'),
        },
      });

      assert.throws(
        () => exportEventSchemas('service-config-manager', schemas),
        (error: unknown) => {
          const message = (error as Error).message;
          assert.ok(message.includes('"platform-config.changed"'));
          assert.ok(message.includes('emitBroadcast'));
          assert.ok(message.includes('onBroadcast'));
          assert.ok(message.includes('client onBroadcast API'));
          return true;
        }
      );
    });

    it('should fail export when the same event name is used for different emitted event types', () => {
      const schemas = createEventSchemasWithoutDevWarnings({
        emitEvents: {
          'platform-config.changed': createFireAndForgetEvent(bsb.string(), 'Fire-and-forget event'),
        },
        emitReturnableEvents: {
          'platform-config.changed': createReturnableEvent(
            bsb.string(),
            bsb.boolean(),
            'Returnable event'
          ),
        },
      });

      assert.throws(
        () => exportEventSchemas('service-config-manager', schemas),
        (error: unknown) => {
          const message = (error as Error).message;
          assert.ok(message.includes('"platform-config.changed"'));
          assert.ok(message.includes('emitEvents'));
          assert.ok(message.includes('emitReturnableEvents'));
          assert.ok(message.includes('Use distinct event names for different event types and directions'));
          return true;
        }
      );
    });

    it('should fail export when the same event name is used across unrelated emit and on categories', () => {
      const schemas = createEventSchemasWithoutDevWarnings({
        emitReturnableEvents: {
          'platform-config.changed': createReturnableEvent(
            bsb.string(),
            bsb.boolean(),
            'Returnable event'
          ),
        },
        onEvents: {
          'platform-config.changed': createFireAndForgetEvent(bsb.string(), 'Fire-and-forget handler'),
        },
      });

      assert.throws(
        () => exportEventSchemas('service-config-manager', schemas),
        (error: unknown) => {
          const message = (error as Error).message;
          assert.ok(message.includes('"platform-config.changed"'));
          assert.ok(message.includes('emitReturnableEvents'));
          assert.ok(message.includes('onEvents'));
          assert.ok(message.includes('one unambiguous contract entry per key'));
          return true;
        }
      );
    });

    it('should export when emit and on categories use different event names', () => {
      const schemas = createEventSchemas({
        emitBroadcast: {
          'platform-config.changed': createBroadcastEvent(bsb.string(), 'Broadcast emitted by this plugin'),
        },
        onBroadcast: {
          'platform-config.reloaded': createBroadcastEvent(bsb.string(), 'Different broadcast handled by this plugin'),
        },
      });

      const exported = exportEventSchemas('service-config-manager', schemas);

      assert.ok(exported.events['platform-config.changed']);
      assert.ok(exported.events['platform-config.reloaded']);
    });

    it('should produce valid AnyVali document format', () => {
      const schemas = createEventSchemas({
        emitEvents: {
          'test.event': createFireAndForgetEvent(
            bsb.object({
              id: bsb.uuid('ID'),
              name: bsb.string({ min: 1, max: 100, description: 'Name' }),
              count: bsb.int32({ min: 0, description: 'Count' }),
            }),
            'Test event with validation'
          ),
        },
      });

      const exported = exportEventSchemas('test-plugin', schemas);
      const inputSchema = exported.events['test.event'].inputSchema as any;

      assert.ok(inputSchema, 'Input schema should exist');
      assert.ok(typeof inputSchema === 'object', 'Input schema should be an object');
      assert.strictEqual(inputSchema.root.kind, 'object', 'Schema should have object root');
      assert.ok(inputSchema.root.properties, 'Schema should have properties');
      assert.ok(inputSchema.root.properties.id, 'Schema should have id property');
      assert.ok(inputSchema.root.properties.name, 'Schema should have name property');
      assert.ok(inputSchema.root.properties.count, 'Schema should have count property');
    });
  });
});
