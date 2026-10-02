import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { emitStreamAndReceiveStream } from '../src/plugins/events-rabbitmq/events/emitStreamAndReceiveStream.js';
import { LIB } from '../src/plugins/events-rabbitmq/events/lib.js';

test('stream packets with missing or rejecting listeners are nacked instead of stalling or crashing the consumer', async () => {
  const noop = () => {};
  const obs: any = { trace: {}, log: { debug: noop, info: noop, warn: noop, error: noop },
    startSpan() { return this; }, end: noop, error: noop };
  const transport = new emitStreamAndReceiveStream({
    myId: 'receiver', getPlatformName: (name: string) => name,
    config: { maxMessageBytes: 1024 },
  } as any);
  const actions: string[] = [];
  let consume!: (message: any) => Promise<void>;
  const channel: any = {
    assertExchange: async () => {}, assertQueue: async () => {}, bindQueue: async () => {},
    consume: async (_name: string, callback: any) => { consume = callback; },
    ack: () => actions.push('ack'),
    nack: (_message: any, _all: boolean, requeue: boolean) => actions.push(`nack:${requeue}`),
  };
  const originalSetupChannel = LIB.setupChannel;
  (LIB as any).setupChannel = async () => ({
    exchangeName: null,
    channel: { addSetup: async (setup: any) => setup(channel) },
  });
  try {
    await transport.setupChannel(obs, undefined, 'events', () => 'queue', 'events');
  } finally {
    (LIB as any).setupChannel = originalSetupChannel;
  }
  const packet = (correlationId: string) => ({
    content: Buffer.from(JSON.stringify({ type: 'data', data: [1, 2, 3] })),
    fields: { routingKey: 'queue' },
    properties: { correlationId, messageId: correlationId },
  });

  await consume(packet('missing'));
  assert.deepEqual(actions, ['nack:true']);
  actions.length = 0;

  transport.on('eventsrejecting', async () => { throw new Error('malformed stream packet'); });
  await consume(packet('rejecting'));
  assert.deepEqual(actions, ['nack:true']);
  actions.length = 0;

  transport.on('eventsvalid', async (_body, ack) => { ack(); });
  await consume(packet('valid'));
  assert.deepEqual(actions, ['ack']);
});

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
