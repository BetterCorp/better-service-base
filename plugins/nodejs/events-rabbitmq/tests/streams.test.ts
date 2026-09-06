import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { emitStreamAndReceiveStream } from '../src/plugins/events-rabbitmq/events/emitStreamAndReceiveStream.js';

test('local stream end needs no broker ack and propagates publish failures', async () => {
  const noop = () => {};
  const obs: any = { trace: {}, log: { debug: noop, info: noop, warn: noop, error: noop },
    startSpan() { return this; }, end: noop, error: noop };
  for (const fails of [false, true]) {
    const transport = new emitStreamAndReceiveStream({ myId: 'sender', getPlatformName: (name: string) => name } as any);
    const stream = new Readable({ read() {} });
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const sent: any[] = [];
    transport.setupChannelsIfNotSetup = async () => {};
    (transport as any).eventsChannel = { channel: { sendToQueue: async () => { started(); return true; } } };
    (transport as any).streamChannel = { channel: { sendToQueue: async (_queue: string, body: any) => {
      if (fails) throw new Error('publish failed');
      sent.push(body);
      return false; // Confirmed publication can still signal backpressure.
    } } };
    const sending = transport.sendStream(obs, 'receiver', 'file', 'receiver||stream||5', stream);
    const checked = fails ? assert.rejects(sending, /publish failed/) : sending;
    await ready;
    // Node's end event passes no Rabbit acknowledgement callbacks.
    await stream.listeners('end')[0]!();
    if (!fails) {
      assert.equal(sent[0].event, 'end');
      transport.emit('91ses-stream', { type: 'event', event: 'end' }, noop, noop);
    }
    await checked;
    assert.equal(transport.eventNames().length, 0);
  }
});
