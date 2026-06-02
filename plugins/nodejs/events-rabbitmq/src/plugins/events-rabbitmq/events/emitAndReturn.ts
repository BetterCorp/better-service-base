import {Plugin} from "../index.js";
import * as amqplib from "amqp-connection-manager";
import * as amqplibCore from "amqplib";
import {EventEmitter} from "events";
import {randomUUID} from "crypto";
import {LIB, SetupChannel} from "./lib.js";
import {
  BSBError,
  SmartFunctionCallAsync,
  Observable,
} from "@bsb/base";

export class emitAndReturn
    extends EventEmitter {
  private plugin: Plugin;
  private privateQueuesSetup: Array<string> = [];
  private publishChannel!: SetupChannel;
  private receiveChannel!: SetupChannel;
  private readonly channelKey = "91ar";
  private readonly myChannelKey = "91kr";
  private readonly queueOpts: amqplib.Options.AssertQueue = {
    durable: false,
    autoDelete: false,
    messageTtl: 60 * 1000, // 60 seconds
    expires: 60 * 1000, // 60s
  };
  private readonly myQueueOpts: amqplib.Options.AssertQueue = {
    exclusive: true,
    durable: false,
    autoDelete: false,
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
          await iChannel.assertQueue(myEARQueueKey, this.myQueueOpts);
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
                try {
                  const body = msg.content.toString();
                  obs.log.debug("[RECEIVED {myEARQueueKey}]", {
                    myEARQueueKey,
                  });
                  this.emit(msg.properties.correlationId, JSON.parse(body));
                  iChannel.ack(msg);
                } catch (exc: any) {
                  obs.log.error("AMQP Consumed exception: {eMsg}", {
                    eMsg: exc.message || exc.toString(),
                  });
                  throw new Error(`AMQP consume exception: ${exc.message || exc}`);
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
    this.publishChannel.channel.close();
    this.receiveChannel.channel.close();
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
          await iChannel.assertQueue(queueKey, this.queueOpts);
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
                const bodyObj = JSON.parse(body) as { trace?: any; args?: Array<any> };
                let handlerObs: Observable | null = null;
                try {
                  const rootObs = this.plugin.createObservableFromTrace(bodyObj.trace, {
                    pluginName,
                    event,
                  });
                  handlerObs = rootObs.startSpan("emitAndReturn.handler", {
                    pluginName,
                    event,
                  });
                  const response = await SmartFunctionCallAsync(
                      this.plugin,
                      listener,
                      handlerObs,
                      bodyObj.args ?? [],
                  );
                  iChannel.ack(msg);
                  obs.log.debug("EAR: OKAY: {queueKey} -> {returnQueue}", {
                    queueKey,
                    returnQueue,
                  });
                  if (
                      !await this.publishChannel.channel.sendToQueue(
                          returnQueue,
                          {
                            trace: handlerObs.trace,
                            result: response,
                          },
                          {
                            expiration: 5000,
                            correlationId: `${msg.properties.correlationId}-resolve`,
                            contentType: "string",
                            appId: this.plugin.myId,
                            timestamp: Date.now(),
                          },
                      )
                  ) {
                    throw new BSBError(handlerObs.trace, "Cannot send msg to queue [{returnQueue}]", {returnQueue});
                  }
                } catch (exc) {
                  const errorObj = exc instanceof Error ? exc : new Error(String(exc));
                  if (handlerObs) {
                    handlerObs.error(errorObj);
                  }
                  obs.log.error("EAR: ERROR: {queueKey} -> {returnQueue}", {
                    queueKey,
                    returnQueue,
                  });
                  if (
                      !await this.publishChannel.channel.sendToQueue(returnQueue, {
                        trace: bodyObj.trace,
                        error: errorObj.message,
                      }, {
                        expiration: 5000,
                        correlationId: `${msg.properties.correlationId}-reject`,
                        contentType: "string",
                        appId: this.plugin.myId,
                        timestamp: Date.now(),
                      })
                  ) {
                    throw new BSBError(obs.trace, "Cannot send msg to queue [{returnQueue}]", {returnQueue});
                  }
                  iChannel.ack(msg);
                } finally {
                  if (handlerObs) {
                    handlerObs.end();
                  }
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

    if (!this.privateQueuesSetup.includes(queueKey)) {
      this.privateQueuesSetup.push(queueKey);
      await this.publishChannel.channel.addSetup(
          async (iChannel: amqplibCore.ConfirmChannel) => {
            await iChannel.assertQueue(queueKey, this.queueOpts);
          },
      );
    }

    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      const timeoutHandler = setTimeout(() => {
        this.removeAllListeners(`${resultKey}-resolve`);
        this.removeAllListeners(`${resultKey}-reject`);
        const err = new Error("Timeout");
        requestObs.error(err);
        requestObs.end();
        reject(err);
      }, timeoutSeconds * 1000);

      this.once(`${resultKey}-resolve`, async (rargs: { result?: any }) => {
        clearTimeout(timeoutHandler);
        requestObs.end();
        resolve(rargs?.result ?? rargs);
      });

      this.once(`${resultKey}-reject`, async (rargs: { error?: string }) => {
        clearTimeout(timeoutHandler);
        const err = new Error(rargs?.error || "Unknown error");
        requestObs.error(err);
        requestObs.end();
        reject(err);
      });

      if (
          !await this.publishChannel.channel.sendToQueue(queueKey, {
            trace: requestObs.trace,
            args,
          }, {
            expiration: timeoutSeconds * 1000 + 5000,
            correlationId: resultKey,
            contentType: "string",
            appId: this.plugin.myId,
            timestamp: Date.now(),
          })
      ) {
        throw new BSBError(requestObs.trace, "Cannot send msg to queue [{queueKey}]", {queueKey});
      }
      requestObs.log.debug("EAR: emitted {queueKey} ({resultKey})", {
        queueKey,
        resultKey,
      });
    });
  }
}
