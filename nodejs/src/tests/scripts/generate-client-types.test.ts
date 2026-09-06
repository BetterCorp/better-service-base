/**
 * Tests for generated BSB virtual clients.
 */

import * as assert from 'assert';
import {
  createBroadcastEvent,
  createEventSchemas,
  createFireAndForgetEvent,
  createReturnableEvent,
  exportEventSchemas,
} from '../../interfaces/schema-events.js';
import { bsb } from '../../interfaces/schema-types.js';
import { generateVirtualClient } from '../../scripts/generate-client-types.js';
import { clientSchemaCode } from '../../scripts/anyvali-client-schema.js';
import { importPortableSchema } from '../../interfaces/schema-types.js';
import * as ts from 'typescript';

describe('generate-client-types', () => {
  it('accepts Python wrapper and tuple field names without losing runtime constraints', () => {
    const document: any = { anyvaliVersion: '1.0', schemaVersion: '1.1', root: {
      kind: 'object', properties: {
        note: { kind: 'optional', schema: { kind: 'nullable', schema: { kind: 'string', minLength: 2 } } },
        pair: { kind: 'tuple', elements: [{ kind: 'int32' }, { kind: 'string' }] },
      }, required: ['pair'], unknownKeys: 'strip',
    } };
    const generated = clientSchemaCode(document, 'Python');
    assert.ok(generated.expression.includes('[number, string]'));
    const parsed = importPortableSchema(document);
    assert.equal(parsed.safeParse({ pair: [1, 'ok'] }).success, true);
    assert.equal(parsed.safeParse({ pair: [1, 'ok'], note: 'x' }).success, false);
  });
  it('keeps the wire target independent of the installed implementation filename', () => {
    const schema = exportEventSchemas('service-orders', createEventSchemas({
      onEvents: { save: createFireAndForgetEvent(bsb.string()) },
    }));
    schema.pluginId = 'service-orders';
    const code = generateVirtualClient(schema, '@bsb/base', 'example--service-orders--csharp');
    assert.ok(code.includes('name: "service-orders"'));
    assert.ok(code.includes('class ExampleServiceOrdersCsharpClient'));
  });
  it('generates a clear client wiring error for listener methods', () => {
    const schemaExport = exportEventSchemas(
      'service-betterportal-config-manager',
      createEventSchemas({
        emitBroadcast: {
          'platform-config.changed': createBroadcastEvent(
            bsb.object({ sourceId: bsb.string() }),
            'Emitted after platform config is saved'
          ),
        },
      })
    );

    const code = generateVirtualClient(
      schemaExport,
      '@bsb/base',
      'service-betterportal-config-manager'
    );

    assert.ok(code.includes('private _requireClientEvents(methodName: string, eventName: string)'));
    assert.ok(code.includes('const events = this._requireClientEvents("onBroadcast", "platform-config.changed");'));
    assert.ok(code.includes('await events.onBroadcast("platform-config.changed", obs, handler);'));
    assert.ok(code.includes('[BSB Client Error] BetterportalConfigManagerClient cannot use'));
    assert.ok(code.includes('has no events facade yet'));
    assert.ok(code.includes('Create generated clients in your service constructor'));
    assert.ok(code.includes('If this client was created inside init/onRegistered/run and used immediately'));
    assert.ok(code.includes('do not instantiate its generated client as a self-listener'));
  });

  it('guards all generated event operations before using this.events', () => {
    const schemaExport = exportEventSchemas(
      'service-client-fixture',
      createEventSchemas({
        emitEvents: {
          'fixture.emitted': createFireAndForgetEvent(bsb.string(), 'Emitted event'),
        },
        onEvents: {
          'fixture.handled': createFireAndForgetEvent(bsb.string(), 'Handled event'),
        },
        emitReturnableEvents: {
          'fixture.ask': createReturnableEvent(bsb.string(), bsb.boolean(), 'Returnable emit'),
        },
        onReturnableEvents: {
          'fixture.answer': createReturnableEvent(bsb.string(), bsb.boolean(), 'Returnable handler'),
        },
        emitBroadcast: {
          'fixture.broadcast': createBroadcastEvent(bsb.string(), 'Broadcast emit'),
        },
        onBroadcast: {
          'fixture.listen': createBroadcastEvent(bsb.string(), 'Broadcast handler'),
        },
      })
    );

    const code = generateVirtualClient(schemaExport, '@bsb/base', 'service-client-fixture');

    assert.ok(code.includes('this._requireClientEvents("onEvent", "fixture.emitted")'));
    assert.ok(code.includes('this._requireClientEvents("onEventSpecific", "fixture.emitted")'));
    assert.ok(code.includes('this._requireClientEvents("emitEvent", "fixture.handled")'));
    assert.ok(code.includes('this._requireClientEvents("emitEventSpecific", "fixture.handled")'));
    assert.ok(code.includes('this._requireClientEvents("onReturnableEvent", "fixture.ask")'));
    assert.ok(code.includes('this._requireClientEvents("onReturnableEventSpecific", "fixture.ask")'));
    assert.ok(code.includes('this._requireClientEvents("emitEventAndReturn", "fixture.answer")'));
    assert.ok(code.includes('this._requireClientEvents("emitEventAndReturnSpecific", "fixture.answer")'));
    assert.ok(code.includes('this._requireClientEvents("onBroadcast", "fixture.broadcast")'));
    assert.ok(code.includes('this._requireClientEvents("emitBroadcast", "fixture.listen")'));
    assert.ok(code.includes('static EventSchemas = _EventSchemas;'));
  });

  it('generates clients for record schemas exported with valueSchema', () => {
    const schemaExport = exportEventSchemas(
      'service-client-records',
      createEventSchemas({
        onReturnableEvents: {
          'fixture.headers': createReturnableEvent(
            bsb.object({ headers: bsb.record(bsb.string(), bsb.string()) }),
            bsb.object({ headers: bsb.record(bsb.string(), bsb.string()) }),
            'Record fixture'
          ),
        },
      })
    );

    const code = generateVirtualClient(schemaExport, '@bsb/base', 'service-client-records');

    assert.ok(code.includes('Record<string, string>'));
    assert.ok(code.includes('importPortableSchema<'));
    assert.ok(code.includes('this._requireClientEvents("emitEventAndReturn", "fixture.headers")'));
  });

  it('preserves the full imported schema while generating static types', () => {
    const document: any = {
      anyvaliVersion: '1.0', schemaVersion: '1.1', extensions: {},
      root: { kind: 'object', required: ['secret'], properties: {
        secret: { kind: 'string', minLength: 3, metadata: { sensitive: true } },
        next: { kind: 'optional', inner: { kind: 'ref', ref: 'Node' } },
      } },
      definitions: { Node: { kind: 'object', required: ['value'], properties: { value: { kind: 'int32', min: 1 } } } },
    };
    const generated = clientSchemaCode(document, '_Fixture');
    assert.ok(generated.declarations[0].includes('_FixtureDefinition0'));
    const javascript = ts.transpileModule(`${generated.declarations.join('\n')}\nmodule.exports = ${generated.expression};`, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText;
    const module = { exports: undefined as any };
    new Function('module', 'importPortableSchema', javascript)(module, importPortableSchema);
    assert.deepEqual(module.exports.export().definitions, document.definitions);
    assert.equal(module.exports.export().root.properties.secret.metadata.sensitive, true);
    assert.equal(module.exports.safeParse({ secret: 'ok' }).success, false);
    assert.equal(module.exports.safeParse({ secret: 'valid', next: { value: 0 } }).success, false);
    assert.equal(module.exports.safeParse({ secret: 'valid', next: { value: 1 } }).success, true);
  });
});
