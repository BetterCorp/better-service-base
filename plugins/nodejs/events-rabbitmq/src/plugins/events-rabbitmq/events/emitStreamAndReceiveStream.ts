import {EventEmitter, Readable} from "stream";
import {randomUUID} from "crypto";
import {Plugin} from "../index";
import * as amqplib from "amqp-connection-manager";
import * as amqplibCore from "amqplib";
import {LIB, SetupChannel} from "./lib";
import {BSBError, IPluginLogger} from "@bsb/base";

export class emitStreamAndReceiveStream
    extends EventEmitter {
  // If we try receive or send a stream and the other party is not ready for some reason, we will automatically timeout in 5s.
  private readonly staticCommsTimeout = 30000; //1000;
  private plugin: Plugin;
  private log: IPluginLogger;
  private eventsChannel!: SetupChannel;
  private streamChannel!: SetupChannel;
  private readonly eventsChannelKey = "91se";
  private readonly streamChannelKey = "91sd";
  private readonly queueOpts: amqplib.Options.AssertQueue = {
    durable: false,
    autoDelete: true,
    messageTtl: 60 * 1000, // 60 seconds
    expires: 60 * 1000, // 60s
  };

  private myEventsQueueKey() {
    return LIB.getMyQueueKey(
        this.plugin,
        this.eventsChannelKey,
        this.plugin.myId,
    );
  }

  private myStreamQueueKey() {
    return LIB.getMyQueueKey(
        this.plugin,
        this.streamChannelKey,
        this.plugin.myId,
    );
  }

  private cleanupSelf(streamId: string, key: string) {
    this.removeAllListeners(this.eventsChannelKey + key + streamId);
    this.removeAllListeners(this.streamChannelKey + key + streamId);
  }

  constructor(plugin: Plugin, log: IPluginLogger) {
    super();
    this.plugin = plugin;
    this.log = log;
  }

  public dispose() {
    this.removeAllListeners();
    if (this.eventsChannel !== undefined) {
      this.eventsChannel.channel.close();
    }
    if (this.streamChannel !== undefined) {
      this.streamChannel.channel.close();
    }
  }

  async setupChannel(
      channel: any,
      channelKey: string,
      queueKeyMethod: Function,
      logMessage: string,
  ) {
    if (channel === undefined) {
      const queueKey = queueKeyMethod();
      channel = await LIB.setupChannel(
          this.plugin,
          this.log,
          this.plugin.receiveConnection,
          channelKey,
          null,
          undefined,
          undefined,
          2,
      );
      this.log.debug(`Ready ${logMessage}: {queueKey}`, {queueKey});

      await channel.channel.addSetup(
          async (iChannel: amqplibCore.ConfirmChannel) => {
            await iChannel.assertQueue(queueKey, this.queueOpts);
            this.log.debug(`LISTEN: [{queueKey}]`, {queueKey});

            await iChannel.consume(
                queueKey,
                async (msg: amqplibCore.ConsumeMessage | null): Promise<any> => {
                  if (msg === null) {
                    return this.log.warn(`[RECEIVED {queueKey}]... as null`, {
                      queueKey,
                    });
                  }
                  try {
                    const body = JSON.parse(msg.content.toString());
                    this.log.debug(`[RECEIVED ${logMessage} {queueKey}]`, {
                      queueKey,
                    });

                    this.emit(
                        channelKey +
                        (
                            logMessage === "stream" ? "r-" : ""
                        ) +
                        msg.properties.correlationId,
                        body,
                        () => iChannel.ack(msg),
                        () => iChannel.nack(msg),
                    );
                  } catch (exc: any) {
                    this.log.error("AMPQ Consumed exception: {eMsg}", {
                      eMsg: exc.message || exc.toString(),
                    });
                    process.exit(7);
                  }
                },
                {noAck: false},
            );

            this.log.debug(`LISTEN: [{queueKey}]`, {queueKey});
            this.log.debug(`Ready ${logMessage} name: {queueKey} OKAY`, {
              queueKey,
            });
          },
      );
    }
  }

  async setupChannelsIfNotSetup() {
    await this.setupChannel(
        this.eventsChannel,
        this.eventsChannelKey,
        this.myEventsQueueKey,
        "events",
    );
    await this.setupChannel(
        this.streamChannel,
        this.streamChannelKey,
        this.myStreamQueueKey,
        "stream",
    );
  }

  async receiveStream(
      listener: { (error: Error | null, stream: Readable): Promise<void> },
      timeoutSeconds = 5,
  ): Promise<string> {
    //const start = new Date().getTime();
    const streamId = `${randomUUID()}-${new Date().getTime()}`;
    let thisTimeoutMS = this.staticCommsTimeout;
    this.log.debug(`SR: listening to {streamId}`, {
      streamId,
    });
    const self = this;
    let dstEventsQueueKey: string;
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve) => {
      await self.setupChannelsIfNotSetup();
      let stream: Readable | null = null;
      let lastResponseTimeoutHandler: NodeJS.Timeout | null = null;
      let lastResponseTimeoutCount: number = 1;
      let receiptTimeoutHandler: NodeJS.Timeout | null;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      let createTimeout = async (e: string): Promise<void> => {
        throw new BSBError("not setup yet : createTimeout");
      };
      const cleanup = () => {
        self.cleanupSelf(streamId, "r-");
        createTimeout = async (e) => {
          self.log.debug("voided timeout creator: {e}", {e});
        };
        self.log.debug("Cleanup stuffR");
        if (receiptTimeoutHandler !== null) {
          clearTimeout(receiptTimeoutHandler);
        }
        receiptTimeoutHandler = null;
        if (lastResponseTimeoutHandler !== null) {
          clearTimeout(lastResponseTimeoutHandler);
        }
        lastResponseTimeoutHandler = null;
        lastResponseTimeoutCount = -2;
        if (stream !== null && !stream.destroyed) {
          stream.destroy();
        }
      };
      receiptTimeoutHandler = setTimeout(async () => {
        self.log.debug("Receive Receipt Timeout");
        const err = new Error("Receive Receipt Timeout");
        cleanup();
        if (
            !(
                await self.eventsChannel.channel.sendToQueue(
                    dstEventsQueueKey,
                    {
                      type: "timeout",
                      data: err,
                    },
                    {
                      expiration: self.queueOpts.messageTtl,
                      correlationId: "s-" + streamId,
                      appId: self.plugin.myId,
                      timestamp: new Date().getTime(),
                    },
                )
            )
        ) {
          throw `Cannot send msg to queue [${dstEventsQueueKey}]`;
        }
        await listener(err, null!);
      }, thisTimeoutMS);
      const timeoutFunc = async () => {
        if (lastResponseTimeoutHandler === null) {
          return;
        }
        if (lastResponseTimeoutCount === -2) {
          return;
        }
        if (lastResponseTimeoutCount > 0) {
          lastResponseTimeoutCount--;
          await createTimeout("timeoutFunc");
          return;
        }
        const err = new Error("Receive Active Timeout");
        self.log.error("Receive Active Timeout");
        cleanup();
        if (
            !(
                await self.eventsChannel.channel.sendToQueue(
                    dstEventsQueueKey,
                    {
                      type: "timeout",
                      data: err,
                    },
                    {
                      expiration: self.queueOpts.messageTtl,
                      correlationId: "s-" + streamId,
                      appId: self.plugin.myId,
                      timestamp: new Date().getTime(),
                    },
                )
            )
        ) {
          throw `Cannot send msg to queue [${dstEventsQueueKey}]`;
        }
        await listener(err, null!);
      };
      createTimeout = async () => {
        if (lastResponseTimeoutCount === -2) {
          return;
        }
        if (lastResponseTimeoutHandler === null) {
          lastResponseTimeoutHandler = setTimeout(timeoutFunc, thisTimeoutMS);
        }
      };
      const updateLastResponseTimer = () => {
        if (lastResponseTimeoutCount === -2) {
          return;
        }
        lastResponseTimeoutCount = 1;
        createTimeout("updateLastResponseTimer");
      };
      const startStream = async () => {
        self.log.debug("START STREAM RECEIVER");
        thisTimeoutMS = timeoutSeconds * 1000;
        if (
            !(
                await self.eventsChannel.channel.sendToQueue(
                    dstEventsQueueKey,
                    {type: "receipt", timeout: thisTimeoutMS},
                    {
                      expiration: self.queueOpts.messageTtl,
                      correlationId: "s-" + streamId,
                      appId: self.plugin.myId,
                      timestamp: new Date().getTime(),
                    },
                )
            )
        ) {
          throw `Cannot send msg to queue [${dstEventsQueueKey}] ${streamId}`;
        }
        try {
          stream = new Readable({
            objectMode: true,
            async read() {
              if (
                  !(
                      await self.eventsChannel.channel.sendToQueue(
                          dstEventsQueueKey,
                          {type: "read"},
                          {
                            expiration: self.queueOpts.messageTtl,
                            correlationId: "s-" + streamId,
                            appId: self.plugin.myId,
                            timestamp: new Date().getTime(),
                          },
                      )
                  )
              ) {
                throw `Cannot send msg to queue [${dstEventsQueueKey}] ${streamId}`;
              }
            },
          });
          self.log.debug(`[R RECEVIED {streamRefId}] {streamId}`, {
            streamRefId: dstEventsQueueKey,
            streamId,
          });
          const eventsToListenTo = [
            "error",
            "end",
          ];
          for (const evnt of eventsToListenTo) {
            stream.on(evnt, async (e: any) => {
              if (
                  !(
                      await self.eventsChannel.channel.sendToQueue(
                          dstEventsQueueKey,
                          {
                            type: "event",
                            event: evnt,
                            data: e || null,
                          },
                          {
                            expiration: self.queueOpts.messageTtl,
                            correlationId: "s-" + streamId,
                            appId: self.plugin.myId,
                            timestamp: new Date().getTime(),
                          },
                      )
                  )
              ) {
                throw `Cannot send msg to queue [${dstEventsQueueKey}] ${streamId}`;
              }
              if (evnt === "end") {
                cleanup();
              }
            });
          }
          self.on(
              self.streamChannelKey + "r-" + streamId,
              async (data: any, ack: { (): void }, nack: { (): void }) => {
                if (data === null) {
                  nack();
                  return self.log.debug(`[R RECEVIED {streamId}]... as null`, {
                    streamId,
                  });
                }
                if (
                    !(
                        await self.eventsChannel.channel.sendToQueue(
                            dstEventsQueueKey,
                            {
                              type: "receipt",
                              timeout: thisTimeoutMS,
                            },
                            {
                              expiration: self.queueOpts.messageTtl,
                              correlationId: "s-" + streamId,
                              appId: self.plugin.myId,
                              timestamp: new Date().getTime(),
                            },
                        )
                    )
                ) {
                  throw `Cannot send msg to queue [${dstEventsQueueKey}] ${streamId}`;
                }
                if (data.type === "event") {
                  stream!.emit(
                      data.event,
                      data.data !== undefined ? data.data : null,
                  );
                  ack();
                  return;
                }
                if (data.type === "data") {
                  stream!.push(Buffer.from(data.data));
                  ack();
                  return;
                }
                nack();
              },
          );
          listener(null, stream)
              .then(async () => {
                self.log.info("stream OK");
              })
              .catch(async (x: Error) => {
                cleanup();
                self.log.error("Stream NOT OK: {e}", {
                  e: x.message,
                });
                process.exit(7);
              });
        } catch (exc: any) {
          cleanup();
          self.log.error("Stream NOT OK: {e}", {
            e: exc.message || exc,
          });
          process.exit(7);
        }
      };
      self.on(
          self.eventsChannelKey + "r-" + streamId,
          async (data: any, ack: { (): void }, nack: { (): void }) => {
            if (receiptTimeoutHandler !== null) {
              clearTimeout(receiptTimeoutHandler);
              receiptTimeoutHandler = null;
            }
            updateLastResponseTimer();
            if (data === null) {
              return self.log.debug(
                  `[R RECEVIED {streamEventsRefId}]... as null`,
                  {streamEventsRefId: dstEventsQueueKey},
              );
            }
            if (data.type === "timeout") {
              cleanup();
              listener(data.data, null!);
              ack();
              return;
            }
            if (data.type === "start") {
              self.log.debug("Readying to stream from: {fromId}", {
                fromId: data.myId,
              });
              dstEventsQueueKey = LIB.getMyQueueKey(
                  self.plugin,
                  this.eventsChannelKey,
                  data.myId,
              );
              await startStream();
              self.log.debug("Starting to stream");
              ack();
              return;
            }
            nack();
          },
      );
      // const end = new Date().getTime();
      // const time = end - start;
      // self.log.reportStat(
      //     `streamrev-${self.streamChannelKey}-${dstEventsQueueKey}-ok`,
      //     time,
      // );
      resolve(`${this.plugin.myId}||${streamId}||${timeoutSeconds}`);
    });
  }

  async sendStream(streamIdf: string, stream: Readable): Promise<void> {
    //const start = new Date().getTime();
    if (streamIdf.split("||").length !== 3) {
      throw new BSBError("invalid stream ID [{id}]", {id: streamIdf});
    }
    const streamReceiverId = streamIdf.split("||")[0];
    const streamId = streamIdf.split("||")[1];
    const streamTimeoutS = Number.parseInt(streamIdf.split("||")[2]);
    let thisTimeoutMS = this.staticCommsTimeout;
    const dstEventsQueueKey = LIB.getMyQueueKey(
        this.plugin,
        this.eventsChannelKey,
        streamReceiverId,
    );
    const dstStreamQueueKey = LIB.getMyQueueKey(
        this.plugin,
        this.streamChannelKey,
        streamReceiverId,
    );
    const self = this;
    this.log.info(`SS: emitting to {dstEventsQueueKey}/{dstStreamQueueKey}`, {
      dstEventsQueueKey,
      dstStreamQueueKey,
    });
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolveI, rejectI) => {
      await self.setupChannelsIfNotSetup();
      let lastResponseTimeoutHandler: NodeJS.Timeout | null = null;
      let lastResponseTimeoutCount: number = 1;
      let receiptTimeoutHandler: NodeJS.Timeout | null = setTimeout(() => {
        reject(new Error("Send Receipt Timeout"));
      }, thisTimeoutMS);
      const cleanup = async (eType: string, e?: Error) => {
        self.log.debug("cleanup: {eType}", {eType});
        self.cleanupSelf(streamId, "s-");
        stream.destroy(e);

        if (receiptTimeoutHandler !== null) {
          clearTimeout(receiptTimeoutHandler);
        }
        if (lastResponseTimeoutHandler !== null) {
          clearTimeout(lastResponseTimeoutHandler);
        }
        receiptTimeoutHandler = null;
        lastResponseTimeoutHandler = null;
      };
      const reject = async (e: Error) => {
        await cleanup("reject-" + e.message, e);
        // const end = new Date().getTime();
        // const time = end - start;
        // self.log.reportStat(
        //     `streamsen-${self.streamChannelKey}-${streamReceiverId}-error`,
        //     time,
        // );
        rejectI(e);
      };
      const resolve = async () => {
        await cleanup("resolved");
        // const end = new Date().getTime();
        // const time = end - start;
        // self.log.reportStat(
        //     `streamsen-${self.streamChannelKey}-${streamReceiverId}-ok`,
        //     time,
        // );
        resolveI();
      };
      const updateLastResponseTimer = () => {
        lastResponseTimeoutCount = 1;
        if (lastResponseTimeoutHandler === null) {
          let createTimeout = (): void => {
            throw new BSBError("not setup yet : createTimeout");
          };
          const timeoutFunc = async () => {
            if (lastResponseTimeoutCount > 0) {
              lastResponseTimeoutCount--;
              createTimeout();
              return;
            }
            self.log.debug("Receive Receipt Timeout");
            const err = new Error("Receive Active Timeout");
            await cleanup("active-timeout");
            if (
                !(
                    await self.eventsChannel.channel.sendToQueue(
                        dstEventsQueueKey,
                        {
                          type: "timeout",
                          data: err,
                        },
                        {
                          expiration: self.queueOpts.messageTtl,
                          correlationId: "r-" + streamId,
                          appId: self.plugin.myId,
                          timestamp: new Date().getTime(),
                        },
                    )
                )
            ) {
              throw `Cannot send msg to queue [${dstEventsQueueKey}]`;
            }
            rejectI(err);
          };
          createTimeout = () => {
            lastResponseTimeoutHandler = setTimeout(timeoutFunc, thisTimeoutMS);
          };
          createTimeout();
        }
      };
      const eventsToListenTo: Array<string> = [
        "error",
        "end",
      ];
      for (const evnt of eventsToListenTo) {
        stream.on(
            evnt,
            async (e: any, b: any, ack: { (): void }, nack: { (): void }) => {
              if (
                  !(
                      await self.streamChannel.channel.sendToQueue(
                          dstStreamQueueKey,
                          {type: "event", event: evnt, data: e || null},
                          {
                            expiration: self.queueOpts.messageTtl,
                            correlationId: /*"r-" + */ streamId,
                            appId: self.plugin.myId,
                            timestamp: new Date().getTime(),
                          },
                      )
                  )
              ) {
                nack();
                throw `Cannot send msg to queue [${dstEventsQueueKey}] ${streamId}`;
              }
              ack();
              if (evnt === "error") {
                reject(e);
              }
            },
        );
      }
      let pushingData = false;
      let streamStarted = false;
      const pushData = async () => {
        if (pushingData) {
          self.log.warn(
              "Stream tried pushing data, but not ready to push data!",
          );
          return;
        }
        pushingData = true;
        self.log.warn("Switching to push data model.");
        stream.on("data", async (data: any) => {
          if (
              !(
                  await self.streamChannel.channel.sendToQueue(
                      dstStreamQueueKey,
                      {type: "data", data},
                      {
                        expiration: self.queueOpts.messageTtl,
                        correlationId: streamId,
                        appId: self.plugin.myId,
                        timestamp: new Date().getTime(),
                      },
                  )
              )
          ) {
            pushingData = false;
            self.log.error(
                `Cannot push msg to queue [{dstStreamQueueKey}] {streamId} / switch back to poll model.`,
                {dstStreamQueueKey, streamId},
            );
          }
        });
      };
      self.on(
          self.eventsChannelKey + "s-" + streamId,
          async (data: any, ack: { (): void }, nack: { (): void }) => {
            if (receiptTimeoutHandler !== null) {
              clearTimeout(receiptTimeoutHandler);
              receiptTimeoutHandler = null;
            }
            updateLastResponseTimer();
            if (data === null) {
              nack();
              return self.log.debug(
                  `[S RECEVIED {dstEventsQueueKey}]... as null`,
                  {dstEventsQueueKey},
              );
            }
            if (data.type === "timeout") {
              await reject(new Error("timeout-receiver"));
              return ack();
            }
            if (data.type === "receipt") {
              thisTimeoutMS = data.timeout;
              return ack();
            }
            if (data.type === "event") {
              if (data.event === "end") {
                ack();
                return resolve();
              }
              stream!.emit(data.event, data.data || null, "RECEIVED");
              return ack();
            }
            if (data.type === "read") {
              if (pushingData) {
                return ack();
              }
              const readData = stream.read();
              if (!stream.readable || readData === null) {
                self.log.info("Stream no longer readable.");
                if (!streamStarted) {
                  await pushData();
                }
                return ack();
              }
              streamStarted = true;
              if (
                  !(
                      await self.streamChannel.channel.sendToQueue(
                          dstStreamQueueKey,
                          {type: "data", data: readData},
                          {
                            expiration: self.queueOpts.messageTtl,
                            correlationId: streamId,
                            appId: self.plugin.myId,
                            timestamp: new Date().getTime(),
                          },
                      )
                  )
              ) {
                nack();
                throw `Cannot send msg to queue [${dstStreamQueueKey}] ${streamId}`;
              }
              ack();
              return;
            }
            ack();
          },
      );
      self.log.info(`SS: setup, ready {streamEventsRefId}`, {
        streamEventsRefId: dstEventsQueueKey,
      });
      if (
          !(
              await self.eventsChannel.channel.sendToQueue(
                  dstEventsQueueKey,
                  {type: "start", myId: self.plugin.myId},
                  {
                    expiration: self.queueOpts.messageTtl,
                    correlationId: "r-" + streamId,
                    appId: self.plugin.myId,
                    timestamp: new Date().getTime(),
                  },
              )
          )
      ) {
        throw `Cannot send msg to queue [${dstEventsQueueKey}]`;
      }
      thisTimeoutMS = streamTimeoutS * 1000;
      self.log.info(
          `SS: emitted {dstEventsQueueKey} with timeout of {thisTimeoutMS}`,
          {dstEventsQueueKey, thisTimeoutMS},
      );
    });
  }
}
