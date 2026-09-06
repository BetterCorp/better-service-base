import { randomUUID, createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { connect } from 'amqp-connection-manager';
import { emitAndReturn } from '../../plugins/nodejs/events-rabbitmq/lib/plugins/events-rabbitmq/events/emitAndReturn.js';
import { emitStreamAndReceiveStream } from '../../plugins/nodejs/events-rabbitmq/lib/plugins/events-rabbitmq/events/emitStreamAndReceiveStream.js';

const noop = () => {};
const observe = trace => ({ trace: trace ?? { t: randomUUID().replaceAll('-', ''), s: randomUUID().replaceAll('-', '').slice(0, 16) },
  log: { debug: noop, info: noop, warn: noop, error: noop },
  startSpan() { return observe(this.trace); }, error: noop, end: noop });
const obs = observe();
const connections = [connect([process.env.BSB_RABBITMQ_URL]), connect([process.env.BSB_RABBITMQ_URL])];
const plugin = { getPlatformName: name => `${name}-${process.env.BSB_INTEROP_PLATFORM}`, myId: randomUUID(),
  publishConnection: connections[0], receiveConnection: connections[1], createObservableFromTrace: observe };
const rpc = new emitAndReturn(plugin), streams = new emitStreamAndReceiveStream(plugin);
const data = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
const bytes = Buffer.concat(Array.from({ length: 4096 }, () => data));
let received;
try {
  await rpc.init(obs);
  await streams.setupChannelsIfNotSetup(obs);
  await rpc.onReturnableEvent(obs, 'nodejs', 'echo', async (span, value) => ({ value, trace: span.trace.t }));
  await rpc.onReturnableEvent(obs, 'nodejs', 'call', async (span, value) => rpc.emitEventAndReturn(span, value.target, 'echo', 10, [value.value]));
  await rpc.onReturnableEvent(obs, 'nodejs', 'crash', async (_span, value) => {
    if (process.env.BSB_INTEROP_CRASH_FIRST === 'true') { console.log('CRASH_READY'); await new Promise(() => {}); }
    return value;
  });
  await rpc.onReturnableEvent(obs, 'nodejs', 'receive', async span => {
    received = undefined;
    return streams.receiveStream(span, 'nodejs', 'file', async (_span, error, stream) => {
      if (error) throw error;
      const digest = createHash('sha256');
      for await (const chunk of stream) digest.update(chunk);
      received = digest.digest('hex');
    }, 5);
  });
  await rpc.onReturnableEvent(obs, 'nodejs', 'digest', async () => received ?? null);
  await rpc.onReturnableEvent(obs, 'nodejs', 'send', async (span, value) => {
    await streams.sendStream(span, value.target, 'file', value.id, Readable.from(Array.from({ length: 16 }, (_, i) => bytes.subarray(i * 65536, (i + 1) * 65536))));
    return true;
  });
  console.log('READY');
  await new Promise(resolve => { process.stdin.once('data', resolve); process.stdin.once('end', resolve); process.stdin.resume(); });
} finally {
  streams.dispose();
  await rpc.dispose();
  await Promise.all(connections.map(connection => connection.close()));
}
