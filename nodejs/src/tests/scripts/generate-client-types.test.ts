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

describe('generate-client-types', () => {
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

    assert.ok(code.includes('bsb.record(bsb.string(), bsb.string())'));
    assert.ok(code.includes('this._requireClientEvents("emitEventAndReturn", "fixture.headers")'));
  });
});
