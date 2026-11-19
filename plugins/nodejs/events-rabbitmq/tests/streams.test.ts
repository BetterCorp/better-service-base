import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { emitStreamAndReceiveStream } from '../src/plugins/events-rabbitmq/events/emitStreamAndReceiveStream.js';
import { LIB } from '../src/plugins/events-rabbitmq/events/lib.js';

const immediate = () => new Promise<void>(resolve => setImmediate(resolve));
const observable = () => {
  const noop = () => {};
  return { trace: {}, log: { debug: noop, info: noop, warn: noop, error: noop },
    startSpan() { return this; }, end: noop, error: noop } as any;
};

test('local stream end needs no broker ack and propagates publish failures', async () => {
  const noop = () => {};
  const obs = observable();
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

test('received stream deliveries stay unacknowledged while Readable backpressure is active', async () => {
  const transport = new emitStreamAndReceiveStream({
    myId: 'receiver',
    getPlatformName: (name: string) => name,
    createObservableFromTrace: () => observable(),
  } as any);
  transport.setupChannelsIfNotSetup = async () => {};
  const publications: any[] = [];
  (transport as any).eventsChannel = { channel: { close: () => {}, sendToQueue: async (_queue: string, body: any) => {
    publications.push(body);
    return true;
  } } };
  (transport as any).streamChannel = { channel: { close: () => {}, sendToQueue: async () => true } };

  let received!: Readable;
  const reference = await transport.receiveStream(observable(), 'sender', 'file', async (_obs, error, stream) => {
    assert.equal(error, null);
    received = stream;
  }, 30);
  const streamId = reference.split('||')[1];
  let startAcks = 0;
  transport.emit(`91ser-${streamId}`, { type: 'start', myId: 'sender', trace: {} }, () => { startAcks++; }, assert.fail);
  await immediate();
  assert.equal(startAcks, 1);
  assert.ok(received);

  let dataAcks = 0;
  for (let index = 0; index < 18; index++) {
    transport.emit(`91sdr-${streamId}`, { type: 'data', data: [index] }, () => { dataAcks++; }, assert.fail);
    await immediate();
  }
  assert.equal(dataAcks, 15, 'three deliveries should remain pending above the object-mode high-water mark');

  // Draining below the high-water mark invokes _read and releases broker
  // deliveries as downstream capacity returns.
  for (let index = 0; index < 4; index++) received.read();
  await immediate();
  assert.ok(dataAcks > 15 && dataAcks < 19);
  let endAcks = 0;
  transport.emit(`91sdr-${streamId}`, { type: 'event', event: 'end' }, () => { endAcks++; }, assert.fail);
  await immediate();
  assert.equal(dataAcks, 18, 'cleanup must settle buffered deliveries');
  assert.equal(endAcks, 1);
  assert.ok(publications.some(item => item.type === 'receipt'));
  transport.dispose();
});

test('aggregate AMQP stream byte accounting is bounded and rejects unsafe counts', () => {
  assert.equal(LIB.addStreamBytes(1024, 2048), 3072);
  assert.throws(() => LIB.addStreamBytes(LIB.MAX_STREAM_BYTES, 1), /stream exceeds/);
  assert.throws(() => LIB.addStreamBytes(-1, 1), /Invalid/);
  assert.throws(() => LIB.addStreamBytes(Number.MAX_SAFE_INTEGER, 1), /stream exceeds/);
});
