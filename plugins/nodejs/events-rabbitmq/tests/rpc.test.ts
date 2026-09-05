import assert from 'node:assert/strict';
import test from 'node:test';
import { emitAndReturn } from '../src/plugins/events-rabbitmq/events/emitAndReturn.js';
import { LIB } from '../src/plugins/events-rabbitmq/events/lib.js';

const noop = () => undefined;
const obs: any = { trace: { t: 'test', s: 'test' }, log: { debug: noop, info: noop, warn: noop, error: noop },
  startSpan() { return this; }, error: noop, end: noop };

function setup() {
  const transport = new emitAndReturn({ getPlatformName: (name: string) => name, myId: 'test',
    createObservableFromTrace: () => obs } as any);
  const rpc = transport as any;
  let consumer: (message: any) => Promise<void>;
  const actions: string[] = [];
  const queues: any[] = [];
  const channel = { assertExchange: async () => {}, bindQueue: async () => {},
    assertQueue: async (name: string, options: any) => { if (name.includes('91ar')) queues.push(options); },
    consume: async (_name: string, callback: any) => { consumer = callback; },
    ack: () => actions.push('ack'), nack: (_msg: any, _all: any, requeue: boolean) => actions.push(`nack:${requeue}`),
  };
  rpc.receiveChannel = { channel: { addSetup: async (fn: any) => fn(channel), close: async () => {} } };
  rpc.publishChannel = { channel: { addSetup: async (fn: any) => fn(channel), close: async () => {},
    sendToQueue: async () => { actions.push('reply'); return true; } } };
  const message = { content: Buffer.from(JSON.stringify({ trace: obs.trace, args: [] })),
    properties: { appId: 'sender', correlationId: 'request', messageId: 'message' }, fields: { routingKey: 'test' } };
  return { rpc, transport, actions, queues, deliver: () => consumer(message) };
}

test('RPC confirms success/error replies before one ack and requeues failed reply delivery', async () => {
  for (const handlerFails of [false, true]) {
    const { rpc, transport, actions, deliver } = setup();
    await transport.onReturnableEvent(obs, 'service', 'event', async () => {
      if (handlerFails) throw new Error('handler failed');
      return 42;
    });
    await deliver();
    assert.deepEqual(actions, ['reply', 'ack']);
    actions.length = 0;
    rpc.publishChannel.channel.sendToQueue = async () => { throw new Error('connection lost'); };
    await deliver();
    assert.deepEqual(actions, ['nack:true']);
  }
});

test('a channel disconnect during nack does not become an unhandled consumer rejection', () => {
  const attempts = new Map<string, number>();
  const channel = { nack: () => { throw new Error('Channel closed'); } } as any;
  assert.doesNotThrow(() => LIB.nackOrDeadLetter(obs, channel, {} as any, attempts, 'message', new Error('reply failed'), 'RPC'));
  assert.equal(attempts.size, 0);
});

test('RPC queue declaration, response cleanup, missing listener, publish failure and disposal', async () => {
  const { rpc, transport, queues } = setup();
  await transport.onReturnableEvent(obs, 'service', 'event', async () => 42);
  rpc.publishChannel.channel.sendToQueue = async (_q: string, _body: any, properties: any) => {
    transport.emit(`${properties.correlationId}-resolve`, { result: null });
    return true;
  };
  for (let i = 0; i < 100; i++) {
    assert.equal(await transport.emitEventAndReturn(obs, 'service', 'event', 1, []), null);
  }
  assert.deepEqual(queues[0], queues[1]);
  assert.equal(transport.eventNames().length, 0);
  rpc.publishChannel.channel.sendToQueue = async (_q: string, _body: any, properties: any) => {
    transport.emit(`${properties.correlationId}-resolve`, null);
    return true;
  };
  await assert.rejects(transport.emitEventAndReturn(obs, 'service', 'event', 1, []), /Invalid RPC response/);
  rpc.publishChannel.channel.sendToQueue = async () => true;
  await assert.rejects(transport.emitEventAndReturn(obs, 'service', 'event', 0.01, []), /Timeout/);
  rpc.publishChannel.channel.sendToQueue = async () => { throw new Error('publish failed'); };
  await assert.rejects(transport.emitEventAndReturn(obs, 'service', 'event', 1, []), /publish failed/);
  rpc.publishChannel.channel.sendToQueue = async () => true;
  const pending = transport.emitEventAndReturn(obs, 'service', 'event', 60, []);
  const rejected = assert.rejects(pending, /disposed/);
  await transport.dispose();
  await rejected;
  assert.equal(transport.eventNames().length, 0);
  assert.equal(rpc.pendingRequests.size, 0);
});
