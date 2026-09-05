import {Plugin} from "../index.js";
import * as amqplib from "amqp-connection-manager";
import * as amqplibCore from "amqplib";
import {EventEmitter} from "events";
import {randomUUID} from "crypto";
import {LIB, SetupChannel} from "./lib.js";
import {
  SmartFunctionCallAsync,
  Observable,
} from "@bsb/base";

export class emitAndReturn
    extends EventEmitter {
  private plugin: Plugin;
  private readonly privateQueuesSetup = new Map<string, Promise<void>>();
  private readonly pendingRequests = new Set<(error: Error) => void>();
  private publishChannel!: SetupChannel;
  private receiveChannel!: SetupChannel;
  private readonly deliveryAttempts = new Map<string, number>();
  private readonly channelKey = "91ar";
  private readonly myChannelKey = "91kr";
  private readonly queueOpts: amqplib.Options.AssertQueue = {
    durable: true,
    autoDelete: false,
    messageTtl: 60 * 1000, // 60 seconds
    expires: 60 * 1000, // 60s
  };
  private readonly myQueueOpts: amqplib.Options.AssertQueue = {
    exclusive: true,
    durable: false,
    autoDelete: true,
    messageTtl: 60 * 1000, // 60 seconds
    expires: 60 * 1000, // 60s
  };

  constructor(plugin: Plugin) {
    super();
    this.plugin = plugin;
  }

  async init(obs: Observable) {
    const myEARQueueKey = LIB.getMyQueueKey(
        this.plugin,
        this.myChannelKey,
        this.plugin.myId,
    );
    obs.log.debug("Ready my events name: {myEARQueueKey}", {
      myEARQueueKey,
    });

    this.publishChannel = await LIB.setupChannel(
        this.plugin,
        obs,
        this.plugin.publishConnection,
        this.myChannelKey,
        null,
    );
    this.receiveChannel = await LIB.setupChannel(
        this.plugin,
        obs,
        this.plugin.receiveConnection,
        this.myChannelKey,
        null,
        undefined,
        undefined,
        2,
    );
    await this.receiveChannel.channel.addSetup(
        async (iChannel: amqplibCore.ConfirmChannel): Promise<void> => {
          await LIB.setupDeadLetterQueue(this.plugin, iChannel);
          await iChannel.assertQueue(myEARQueueKey, LIB.withDeadLetter(this.plugin, this.myQueueOpts));
          obs.log.debug("LISTEN: [{myEARQueueKey}]", {myEARQueueKey});
          await iChannel.consume(
              myEARQueueKey,
              (msg: amqplibCore.ConsumeMessage | null): any => {
                if (msg === null) {
                  obs.log.warn("[RECEIVED {myEARQueueKey}]... as null", {
                    myEARQueueKey,
                  });
                  return;
                }
                const body = msg.content.toString();
                const deliveryKey = LIB.deliveryKey(msg, body);
                try {
                  obs.log.debug("[RECEIVED {myEARQueueKey}]", {
                    myEARQueueKey,
                  });
                  this.emit(msg.properties.correlationId, JSON.parse(body));
                  LIB.clearDeliveryFailure(this.deliveryAttempts, deliveryKey);
                  iChannel.ack(msg);
                } catch (exc: any) {
                  const errorObj = exc instanceof Error ? exc : new Error(exc?.message || String(exc));
                  LIB.nackOrDeadLetter(obs, iChannel, msg, this.deliveryAttempts, deliveryKey, errorObj, "EAR response consume");
                }
              },
              {noAck: false},
          );
          obs.log.debug("LISTEN: [{myEARQueueKey}]", {myEARQueueKey});
          obs.log.debug("Ready my events name: {myEARQueueKey} OKAY", {
            myEARQueueKey,
          });
        },
    );
  }

  public dispose() {
    for (const reject of this.pendingRequests) reject(new Error("Events transport disposed"));
    this.removeAllListeners();
    return Promise.all([this.publishChannel.channel.close(), this.receiveChannel.channel.close()]);
  }

  async onReturnableEvent(
      obs: Observable,
      pluginName: string,
      event: string,
      listener: { (obs: Observable, args: Array<any>): Promise<any> },
  ): Promise<void> {
    const queueKey = LIB.getQueueKey(
        this.plugin,
        this.channelKey,
        pluginName,
        event,
    );
    obs.log.debug("EAR: listen {queueKey}", {
      queueKey,
    });

    await this.receiveChannel.channel.addSetup(
        async (iChannel: amqplibCore.ConfirmChannel) => {
          await LIB.setupDeadLetterQueue(this.plugin, iChannel);
          await iChannel.assertQueue(queueKey, LIB.withDeadLetter(this.plugin, this.queueOpts));
          await iChannel.consume(
              queueKey,
              async (msg: amqplibCore.ConsumeMessage | null): Promise<any> => {
                if (msg === null) {
                  return obs.log.error(
                      "Message received on my EAR queue was null...",
                  );
                }
                const returnQueue = LIB.getMyQueueKey(
                    this.plugin,
                    this.myChannelKey,
                    msg.properties.appId,
                );
                obs.log.debug("EAR: Received: {queueKey} from {returnQueue}", {
                  queueKey,
                  returnQueue,
                });
                const body = msg.content.toString();
                const deliveryKey = LIB.deliveryKey(msg, body);
                let handlerObs: Observable | null = null;
                try {
                  const bodyObj = JSON.parse(body) as { trace?: any; args?: Array<any> };
                  if (!bodyObj || typeof bodyObj !== "object" || Array.isArray(bodyObj) ||
                      (bodyObj.args !== undefined && !Array.isArray(bodyObj.args))) {
                    throw new Error("Invalid RPC request");
                  }
                  handlerObs = this.plugin.createObservableFromTrace(bodyObj.trace, {
                    pluginName, event,
                  }).startSpan("emitAndReturn.handler", { pluginName, event });

                  let reply: { trace: any; result?: any; error?: string };
                  let outcome = "resolve";
                  try {
                    const result = await SmartFunctionCallAsync(this.plugin, listener, handlerObs, bodyObj.args ?? []);
                    reply = { trace: handlerObs.trace, result };
                  } catch (error) {
                    const failure = error instanceof Error ? error : new Error(String(error));
                    handlerObs.error(failure);
                    reply = { trace: handlerObs.trace, error: failure.message };
                    outcome = "reject";
                  }

                  await this.publishChannel.channel.sendToQueue(returnQueue, reply, {
                    expiration: 5000,
                    timeout: 5000,
                    correlationId: `${msg.properties.correlationId}-${outcome}`,
                    contentType: "string",
                    messageId: randomUUID(),
                    persistent: true,
                    appId: this.plugin.myId,
                    timestamp: Date.now(),
                  });
                  // Leave the request unacked until its reply is confirmed. A crashed
                  // consumer is redelivered; handlers must tolerate duplicate requests.
                  LIB.clearDeliveryFailure(this.deliveryAttempts, deliveryKey);
                  iChannel.ack(msg);
                } catch (error) {
                  const failure = error instanceof Error ? error : new Error(String(error));
                  handlerObs?.error(failure);
                  LIB.nackOrDeadLetter(obs, iChannel, msg, this.deliveryAttempts, deliveryKey, failure, "EAR request consume");
                } finally {
                  handlerObs?.end();
                }
              },
              {noAck: false},
          );
          obs.log.debug("EAR: listening {queueKey}", {
            queueKey,
          });
        },
    );
  }

  async emitEventAndReturn(
      obs: Observable,
      pluginName: string,
      event: string,
      timeoutSeconds: number,
      args: Array<any>,
  ): Promise<any> {
    const start = Date.now();
    const resultKey = `${randomUUID()}-${start}${Math.random()}`;
    const queueKey = LIB.getQueueKey(
        this.plugin,
        this.channelKey,
        pluginName,
        event,
    );
    const requestObs = obs.startSpan("emitAndReturn.request", {
      pluginName,
      event,
      correlationId: resultKey,
    });
    requestObs.log.debug("EAR: emitting {queueKey} ({resultKey})", {
      queueKey,
      resultKey,
    });

    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        settled = true;
        clearTimeout(timeoutHandler);
        this.removeAllListeners(`${resultKey}-resolve`);
        this.removeAllListeners(`${resultKey}-reject`);
        this.pendingRequests.delete(fail);
        requestObs.end();
      };
      const fail = (error: Error) => {
        if (settled) return;
        requestObs.error(error);
        cleanup();
        reject(error);
      };
      const timeoutHandler = setTimeout(() => fail(new Error("Timeout")), timeoutSeconds * 1000);
      this.pendingRequests.add(fail);
      this.once(`${resultKey}-resolve`, (reply: { result?: any }) => {
        if (settled) return;
        if (!reply || typeof reply !== 'object' || Array.isArray(reply)) {
          fail(new Error('Invalid RPC response'));
          return;
        }
        cleanup();
        // JSON omits an undefined result; a missing result still means undefined.
        resolve(reply.result);
      });
      this.once(`${resultKey}-reject`, (reply: { error?: string }) => {
        fail(new Error(reply?.error || "Unknown error"));
      });

      const publish = async () => {
        let setup = this.privateQueuesSetup.get(queueKey);
        if (!setup) {
          setup = this.publishChannel.channel.addSetup(async (channel: amqplibCore.ConfirmChannel) => {
            await LIB.setupDeadLetterQueue(this.plugin, channel);
            await channel.assertQueue(queueKey, LIB.withDeadLetter(this.plugin, this.queueOpts));
          });
          this.privateQueuesSetup.set(queueKey, setup);
          setup.catch(() => this.privateQueuesSetup.delete(queueKey));
        }
        await setup;
        if (settled) return;
        await this.publishChannel.channel.sendToQueue(queueKey, {
          trace: requestObs.trace, args,
        }, {
          expiration: timeoutSeconds * 1000 + 5000,
          timeout: timeoutSeconds * 1000,
          correlationId: resultKey,
          contentType: "string",
          messageId: randomUUID(),
          persistent: true,
          appId: this.plugin.myId,
          timestamp: Date.now(),
        });
      };
      void publish().catch((error) => fail(error instanceof Error ? error : new Error(String(error))));
    });
  }
}
