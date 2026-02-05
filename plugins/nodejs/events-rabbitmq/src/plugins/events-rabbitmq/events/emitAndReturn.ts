import {Plugin} from "../index";
import * as amqplib from "amqp-connection-manager";
import * as amqplibCore from "amqplib";
import {EventEmitter} from "events";
import {randomUUID} from "crypto";
import {LIB, SetupChannel} from "./lib";
import {
  BSBError,
  IPluginLogger,
  SmartFunctionCallAsync,
} from "@bsb/base";

export class emitAndReturn
    extends EventEmitter {
  private plugin: Plugin;
  private log: IPluginLogger;
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

  constructor(plugin: Plugin, log: IPluginLogger) {
    super();
    this.plugin = plugin;
    this.log = log;
  }

  async init() {
    const myEARQueueKey = LIB.getMyQueueKey(
        this.plugin,
        this.myChannelKey,
        this.plugin.myId,
    );
    this.log.debug(`Ready my events name: {myEARQueueKey}`, {
      myEARQueueKey,
    });

    this.publishChannel = await LIB.setupChannel(
        this.plugin,
        this.log,
        this.plugin.publishConnection,
        this.myChannelKey,
        null,
    );
    this.receiveChannel = await LIB.setupChannel(
        this.plugin,
        this.log,
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
          this.log.debug(`LISTEN: [{myEARQueueKey}]`, {myEARQueueKey});
          await iChannel.consume(
              myEARQueueKey,
              (msg: amqplibCore.ConsumeMessage | null): any => {
                if (msg === null) {
                  this.log.warn(`[RECEIVED {myEARQueueKey}]... as null`, {
                    myEARQueueKey,
                  });
                  return;
                }
                try {
                  const body = msg.content.toString();
                  this.log.debug(`[RECEIVED {myEARQueueKey}]`, {
                    myEARQueueKey,
                  });
                  this.emit(msg.properties.correlationId, JSON.parse(body));
                  iChannel.ack(msg);
                } catch (exc: any) {
                  this.log.error("AMQP Consumed exception: {eMsg}", {
                    eMsg: exc.message || exc.toString(),
                  });
                  process.exit(7);
                }
              },
              {noAck: false},
          );
          this.log.debug(`LISTEN: [{myEARQueueKey}]`, {myEARQueueKey});
          this.log.debug(`Ready my events name: {myEARQueueKey} OKAY`, {
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
      pluginName: string,
      event: string,
      listener: { (traceId: string | undefined, args: Array<any>): Promise<any> },
  ): Promise<void> {
    const queueKey = LIB.getQueueKey(
        this.plugin,
        this.channelKey,
        pluginName,
        event,
    );
    this.log.debug(` EAR: listen {queueKey}`, {
      queueKey,
    });

    await this.receiveChannel.channel.addSetup(
        async (iChannel: amqplibCore.ConfirmChannel) => {
          await iChannel.assertQueue(queueKey, this.queueOpts);
          await iChannel.consume(
              queueKey,
              async (msg: amqplibCore.ConsumeMessage | null): Promise<any> => {
                //const start = Date.now();
                if (msg === null) {
                  return this.log.error(
                      "Message received on my EAR queue was null...",
                  );
                }
                const returnQueue = LIB.getMyQueueKey(
                    this.plugin,
                    this.myChannelKey,
                    msg.properties.appId,
                );
                this.log.debug(`EAR: Received: {queueKey} from {returnQueue}`, {
                  queueKey,
                  returnQueue,
                });
                const body = msg.content.toString();
                const bodyObj = JSON.parse(body) as Array<any>;
                try {
                  const response = await SmartFunctionCallAsync(
                      this.plugin,
                      listener,
                      bodyObj.splice(0, 1)[0],
                      bodyObj,
                  );
                  iChannel.ack(msg);
                  this.log.debug(`EAR: OKAY: {queueKey} -> {returnQueue}`, {
                    queueKey,
                    returnQueue,
                  });
                  if (
                      !await this.publishChannel.channel.sendToQueue(
                          returnQueue,
                          response,
                          {
                            expiration: 5000,
                            correlationId: `${msg.properties.correlationId}-resolve`,
                            contentType: "string",
                            appId: this.plugin.myId,
                            timestamp: Date.now(),
                          },
                      )
                  ) {
                    throw new BSBError(`Cannot send msg to queue [{returnQueue}]`, {returnQueue});
                  }
                  // const time = Date.now() - start;
                  // this.log.reportStat(
                  //     `eventsrec-${this.channelKey}-${pluginName}-${event}-ok`,
                  //     time,
                  // );
                } catch (exc) {
                  this.log.error(`EAR: ERROR: {queueKey} -> {returnQueue}`, {
                    queueKey,
                    returnQueue,
                  });
                  if (
                      !await this.publishChannel.channel.sendToQueue(returnQueue, exc, {
                        expiration: 5000,
                        correlationId: `${msg.properties.correlationId}-reject`,
                        contentType: "string",
                        appId: this.plugin.myId,
                        timestamp: Date.now(),
                      })
                  ) {
                    throw new BSBError(`Cannot send msg to queue [{returnQueue}]`, {returnQueue});
                  }
                  iChannel.ack(msg);
                  //const time = Date.now() - start;
                  // this.log.reportStat(
                  //     `eventsrec-${this.channelKey}-${pluginName}-${event}-error`,
                  //     time,
                  // );
                }
              },
              {noAck: false},
          );
          this.log.debug(`EAR: listening {queueKey}`, {
            queueKey,
          });
        },
    );
  }

  async emitEventAndReturn(
      pluginName: string,
      event: string,
      traceId: string | undefined,
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
    this.log.debug(`EAR: emitting {queueKey} ({resultKey})`, {
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
        // const time = Date.now() - start;
        // this.log.reportStat(
        //     `eventssen-${this.channelKey}-${pluginName}-${event}-error`,
        //     time,
        // );
        reject("Timeout");
      }, timeoutSeconds * 1000);

      this.once(`${resultKey}-resolve`, async (rargs: string) => {
        clearTimeout(timeoutHandler);
        // const time = Date.now() - start;
        // this.log.reportStat(
        //     `eventssen-${this.channelKey}-${pluginName}-${event}-ok`,
        //     time,
        // );
        resolve(rargs);
      });

      this.once(`${resultKey}-reject`, async (rargs: any) => {
        clearTimeout(timeoutHandler);
        // const time = Date.now() - start;
        // this.log.reportStat(
        //     `eventssen-${this.channelKey}-${pluginName}-${event}-error`,
        //     time,
        // );
        reject(rargs);
      });

      if (
          !await this.publishChannel.channel.sendToQueue(queueKey, [traceId, ...args], {
            expiration: timeoutSeconds * 1000 + 5000,
            correlationId: resultKey,
            contentType: "string",
            appId: this.plugin.myId,
            timestamp: Date.now(),
          })
      ) {
        throw new BSBError(`Cannot send msg to queue [{queueKey}]`, {queueKey});
      }
      this.log.debug(`EAR: emitted {queueKey} ({resultKey})`, {
        queueKey,
        resultKey,
      });
    });
  }
}
