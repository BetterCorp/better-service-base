import {EventEmitter, Readable} from "stream";
import {randomUUID} from "crypto";
import {Plugin} from "../index.js";
import * as amqplib from "amqp-connection-manager";
import * as amqplibCore from "amqplib";
import {LIB, SetupChannel} from "./lib.js";
import {BSBError, Observable} from "@bsb/base";

export class emitStreamAndReceiveStream
    extends EventEmitter {
  // If we try receive or send a stream and the other party is not ready for some reason, we will automatically timeout in 5s.
  private readonly staticCommsTimeout = 30000; //1000;
  private plugin: Plugin;
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

  constructor(plugin: Plugin) {
    super();
    this.plugin = plugin;
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
      obs: Observable,
      channel: any,
      channelKey: string,
      queueKeyMethod: Function,
      logMessage: string,
  ) {
    if (channel === undefined) {
      const queueKey = queueKeyMethod();
      channel = await LIB.setupChannel(
          this.plugin,
          obs,
          this.plugin.receiveConnection,
          channelKey,
          null,
          undefined,
          undefined,
          2,
      );
      obs.log.debug("Ready {logMessage}: {queueKey}", { logMessage, queueKey });

      await channel.channel.addSetup(
          async (iChannel: amqplibCore.ConfirmChannel) => {
            await iChannel.assertQueue(queueKey, this.queueOpts);
            obs.log.debug("LISTEN: [{queueKey}]", { queueKey });

            await iChannel.consume(
                queueKey,
                async (msg: amqplibCore.ConsumeMessage | null): Promise<any> => {
                  if (msg === null) {
                    return obs.log.warn("[RECEIVED {queueKey}]... as null", {
                      queueKey,
                    });
                  }
                  try {
                    const body = JSON.parse(msg.content.toString());
                    obs.log.debug("[RECEIVED {logMessage} {queueKey}]", {
                      logMessage,
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
                    obs.log.error("AMQP Consumed exception: {eMsg}", {
                      eMsg: exc.message || exc.toString(),
                    });
                    throw new Error(`AMQP consume exception: ${exc.message || exc}`);
                  }
                },
                {noAck: false},
            );

            obs.log.debug("LISTEN: [{queueKey}]", { queueKey });
            obs.log.debug("Ready {logMessage} name: {queueKey} OKAY", {
              logMessage,
              queueKey,
            });
          },
      );
    }
  }

  async setupChannelsIfNotSetup(obs: Observable) {
    await this.setupChannel(
        obs,
        this.eventsChannel,
        this.eventsChannelKey,
        this.myEventsQueueKey,
        "events",
    );
    await this.setupChannel(
        obs,
        this.streamChannel,
        this.streamChannelKey,
        this.myStreamQueueKey,
        "stream",
    );
  }

  async receiveStream(
      obs: Observable,
      pluginName: string,
      event: string,
      listener: { (obs: Observable, error: Error | null, stream: Readable): Promise<void> },
      timeoutSeconds = 5,
  ): Promise<string> {
    //const start = new Date().getTime();
    const streamId = `${randomUUID()}-${new Date().getTime()}`;
    let thisTimeoutMS = this.staticCommsTimeout;
    obs.log.debug("SR: listening to {streamId}", {
      streamId,
    });
    const self = this;
    let dstEventsQueueKey: string;
    let streamObs: Observable | null = null;
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve) => {
      await self.setupChannelsIfNotSetup(obs);
      let stream: Readable | null = null;
      let lastResponseTimeoutHandler: NodeJS.Timeout | null = null;
      let lastResponseTimeoutCount: number = 1;
      let receiptTimeoutHandler: NodeJS.Timeout | null;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      let createTimeout = async (e: string): Promise<void> => {
        throw new BSBError(obs.trace, "not setup yet : createTimeout");
      };
      const cleanup = () => {
        self.cleanupSelf(streamId, "r-");
        createTimeout = async (e) => {
          obs.log.debug("voided timeout creator: {e}", {e});
        };
        obs.log.debug("Cleanup stuffR");
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
        if (streamObs) {
          streamObs.end();
        }
      };
      receiptTimeoutHandler = setTimeout(async () => {
        obs.log.debug("Receive Receipt Timeout");
        const err = new Error("Receive Receipt Timeout");
        cleanup();
        if (
            !(
                await self.eventsChannel.channel.sendToQueue(
                    dstEventsQueueKey,
                    {
                      type: "timeout",
                      data: err,
                      trace: streamObs?.trace ?? obs.trace,
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
        await listener(streamObs ?? obs, err, null!);
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
        obs.log.error("Receive Active Timeout");
        cleanup();
        if (
            !(
                await self.eventsChannel.channel.sendToQueue(
                    dstEventsQueueKey,
                    {
                      type: "timeout",
                      data: err,
                      trace: streamObs?.trace ?? obs.trace,
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
        await listener(streamObs ?? obs, err, null!);
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
        obs.log.debug("START STREAM RECEIVER");
        thisTimeoutMS = timeoutSeconds * 1000;
        if (
            !(
                await self.eventsChannel.channel.sendToQueue(
                    dstEventsQueueKey,
                    {type: "receipt", timeout: thisTimeoutMS, trace: streamObs?.trace ?? obs.trace},
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
                          {type: "read", trace: streamObs?.trace ?? obs.trace},
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
          obs.log.debug("[R RECEVIED {streamRefId}] {streamId}", {
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
                            trace: streamObs?.trace ?? obs.trace,
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
                  return obs.log.debug("[R RECEVIED {streamId}]... as null", {
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
                              trace: streamObs?.trace ?? obs.trace,
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
          listener(streamObs ?? obs, null, stream)
              .then(async () => {
                obs.log.info("stream OK");
              })
              .catch(async (x: Error) => {
                cleanup();
                obs.log.error("Stream NOT OK: {e}", {
                  e: x.message,
                });
                throw new Error(`Stream processing failed: ${x.message}`);
              });
        } catch (exc: any) {
          cleanup();
          obs.log.error("Stream NOT OK: {e}", {
            e: exc.message || exc,
          });
          throw new Error(`Stream setup failed: ${exc.message || exc}`);
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
              return obs.log.debug(
                  `[R RECEVIED {streamEventsRefId}]... as null`,
                  {streamEventsRefId: dstEventsQueueKey},
              );
            }
            if (data.type === "timeout") {
              cleanup();
              listener(streamObs ?? obs, data.data, null!);
              ack();
              return;
            }
            if (data.type === "start") {
              const trace = data.trace ?? obs.trace;
              streamObs = this.plugin.createObservableFromTrace(trace, {
                pluginName,
                event,
                streamId,
              }).startSpan("stream.receive", { pluginName, event, streamId });
              obs.log.debug("Readying to stream from: {fromId}", {
                fromId: data.myId,
              });
              dstEventsQueueKey = LIB.getMyQueueKey(
                  self.plugin,
                  this.eventsChannelKey,
                  data.myId,
              );
              await startStream();
              obs.log.debug("Starting to stream");
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

  async sendStream(
      obs: Observable,
      pluginName: string,
      event: string,
      streamIdf: string,
      stream: Readable
  ): Promise<void> {
    //const start = new Date().getTime();
    if (streamIdf.split("||").length !== 3) {
      throw new BSBError(obs.trace, "invalid stream ID [{id}]", {id: streamIdf});
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
    const sendObs = obs.startSpan("stream.send", { pluginName, event, streamId });
    sendObs.log.info("SS: emitting to {dstEventsQueueKey}/{dstStreamQueueKey}", {
      dstEventsQueueKey,
      dstStreamQueueKey,
    });
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolveI, rejectI) => {
      await self.setupChannelsIfNotSetup(sendObs);
      let lastResponseTimeoutHandler: NodeJS.Timeout | null = null;
      let lastResponseTimeoutCount: number = 1;
      let receiptTimeoutHandler: NodeJS.Timeout | null = setTimeout(() => {
        reject(new Error("Send Receipt Timeout"));
      }, thisTimeoutMS);
      const cleanup = async (eType: string, e?: Error) => {
        sendObs.log.debug("cleanup: {eType}", {eType});
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
        sendObs.end();
      };
      const reject = async (e: Error) => {
        await cleanup("reject-" + e.message, e);
        sendObs.error(e);
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
            throw new BSBError(sendObs.trace, "not setup yet : createTimeout");
          };
          const timeoutFunc = async () => {
            if (lastResponseTimeoutCount > 0) {
              lastResponseTimeoutCount--;
              createTimeout();
              return;
            }
            sendObs.log.debug("Receive Receipt Timeout");
            const err = new Error("Receive Active Timeout");
            await cleanup("active-timeout");
            if (
                !(
                    await self.eventsChannel.channel.sendToQueue(
                        dstEventsQueueKey,
                        {
                          type: "timeout",
                          data: err,
                          trace: sendObs.trace,
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
                          {type: "event", event: evnt, data: e || null, trace: sendObs.trace},
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
          sendObs.log.warn(
              "Stream tried pushing data, but not ready to push data!",
          );
          return;
        }
        pushingData = true;
        sendObs.log.warn("Switching to push data model.");
        stream.on("data", async (data: any) => {
          if (
              !(
                  await self.streamChannel.channel.sendToQueue(
                      dstStreamQueueKey,
                      {type: "data", data, trace: sendObs.trace},
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
            sendObs.log.error(
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
              return sendObs.log.debug(
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
                sendObs.log.info("Stream no longer readable.");
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
                          {type: "data", data: readData, trace: sendObs.trace},
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
      sendObs.log.info("SS: setup, ready {streamEventsRefId}", {
        streamEventsRefId: dstEventsQueueKey,
      });
      if (
          !(
              await self.eventsChannel.channel.sendToQueue(
                  dstEventsQueueKey,
                  {type: "start", myId: self.plugin.myId, trace: sendObs.trace},
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
      sendObs.log.info(
          "SS: emitted {dstEventsQueueKey} with timeout of {thisTimeoutMS}",
          {dstEventsQueueKey, thisTimeoutMS},
      );
    });
  }
}
