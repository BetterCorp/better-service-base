import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { connect } from 'amqp-connection-manager';
import amqp from 'amqplib';
import { emitAndReturn } from '../src/plugins/events-rabbitmq/events/emitAndReturn.js';

test('broker retains requests without listeners and redelivers after consumer disconnect',
  { skip: !process.env.BSB_RABBITMQ_URL, timeout: 20000 }, async () => {
    const url = process.env.BSB_RABBITMQ_URL!;
    const prefix = `bsb-regression-${randomUUID()}`;
    const noop = () => undefined;
    const obs: any = { trace: { t: 'test', s: 'test' }, log: { debug: noop, info: noop, warn: noop, error: noop },
      startSpan() { return this; }, error: noop, end: noop };
    const connection = connect([url]);
    const raw = await amqp.connect(url);
    const make = () => new emitAndReturn({ getPlatformName: (name: string) => `${prefix}-${name}`,
      myId: randomUUID(), publishConnection: connection, receiveConnection: connection,
      createObservableFromTrace: () => obs } as any);
    const caller = make(), receiver = make();
    try {
      await Promise.all([caller.init(obs), receiver.init(obs)]);
      const waiting = caller.emitEventAndReturn(obs, 'service', 'late', 5, []);
      const waitingResult = assert.doesNotReject(async () => assert.equal(await waiting, 42));
      const waitingQueue = `${prefix}-91ar-service-late`;
      await (caller as any).privateQueuesSetup.get(waitingQueue);
      const inspection = await raw.createChannel();
      let count = 0;
      for (let attempt = 0; attempt < 100 && count === 0; attempt++) {
        count = (await inspection.checkQueue(waitingQueue)).messageCount;
        if (count === 0) await delay(10);
      }
      assert.equal(count, 1, 'request must remain queued before a listener exists');
      await inspection.close();
      await receiver.onReturnableEvent(obs, 'service', 'late', async () => 42);
      await waitingResult;

      const crashed = await raw.createChannel();
      const queue = `${prefix}-91ar-service-crash`;
      await crashed.assertQueue(queue, { durable: true, autoDelete: false, messageTtl: 60000, expires: 60000,
        deadLetterExchange: `${prefix}-better.service9.deadletter` });
      const delivery = new Promise<void>((resolve, reject) => {
        void crashed.consume(queue, message => {
          if (message) void crashed.close().then(resolve, reject); // disconnect without ack
        }, { noAck: false }).catch(reject);
      });
      const request = caller.emitEventAndReturn(obs, 'service', 'crash', 5, []);
      const result = assert.doesNotReject(async () => assert.equal(await request, 'redelivered'));
      await delivery;
      await receiver.onReturnableEvent(obs, 'service', 'crash', async () => 'redelivered');
      await result;
    } finally {
      await Promise.all([caller.dispose(), receiver.dispose()]);
      const cleanup = await raw.createChannel();
      for (const event of ['late', 'crash']) await cleanup.deleteQueue(`${prefix}-91ar-service-${event}`);
      await cleanup.deleteQueue(`${prefix}-better.service9.deadletter`);
      await cleanup.deleteExchange(`${prefix}-better.service9.deadletter`);
      await raw.close();
      await connection.close();
    }
  });
