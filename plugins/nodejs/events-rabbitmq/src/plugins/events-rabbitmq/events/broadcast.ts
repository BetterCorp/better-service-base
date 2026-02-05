import {Plugin} from "../index";
import * as amqplib from "amqp-connection-manager";
import * as amqplibCore from "amqplib";
import {LIB, SetupChannel} from "./lib";
import {randomUUID} from "crypto";
import {
  IPluginLogger,
  SmartFunctionCallAsync,
} from "@bsb/base";

export class broadcast {
  private plugin: Plugin;
  private log: IPluginLogger;
  private publishQueuesSetup: Array<string> = [];
  private publishChannel!: SetupChannel<string>;
  private receiveChannel!: SetupChannel<string>;
  private readonly channelKey = "91eb";
  private readonly exchange = {
    type: "fanout",
    name: "better.service9.broadcast",
  };
  private readonly exchangeOpts: amqplib.Options.AssertExchange = {
    durable: false,
    //exclusive: true,
    autoDelete: false,
  };
  private readonly queueOpts: amqplib.Options.AssertQueue = {
    durable: false,
    autoDelete: false,
    messageTtl: 60 * 60 * 1000, // 60 min
    expires: 60 * 60 * 1000, // 60 min
  };

  constructor(plugin: Plugin, log: IPluginLogger) {
    this.plugin = plugin;
    this.log = log;
  }

  async init() {
    this.log.debug(`Open broadcast channel ({exchangeName})`, {
      exchangeName: this.exchange.name,
    });
    this.publishChannel = await LIB.setupChannel(
        this.plugin,
        this.log,
        this.plugin.publishConnection,
        this.channelKey,
        this.exchange.name,
        this.exchange.type,
        this.exchangeOpts,
    );
    this.receiveChannel = await LIB.setupChannel(
        this.plugin,
        this.log,
        this.plugin.receiveConnection,
        this.channelKey,
        this.exchange.name,
        this.exchange.type,
        this.exchangeOpts,
        5,
    );
  }

  public dispose() {
    this.publishChannel.channel.close();
    this.receiveChannel.channel.close();
  }

  async onBroadcast(
      pluginName: string,
      event: string,
      listener: { (traceId: string | undefined, args: Array<any>): Promise<void> },
  ): Promise<void> {
    const thisUUID = randomUUID();
    const rawQueueKey = LIB.getQueueKey(
        this.plugin,
        this.channelKey,
        pluginName,
        event,
    );
    const thisQueueKey = LIB.getQueueKey(
        this.plugin,
        this.channelKey,
        pluginName,
        event,
        thisUUID,
    );
    this.log.debug(`LISTEN: [{thisQueueKey}]`, {
      thisQueueKey: rawQueueKey,
    });

    await this.receiveChannel.channel.addSetup(
        async (iChannel: amqplibCore.ConfirmChannel) => {
          await iChannel.assertQueue(thisQueueKey, this.queueOpts);
          await this.receiveChannel.channel.consume(
              thisQueueKey,
              async (msg: amqplibCore.ConsumeMessage) => {
                //const start = Date.now();
                const body = msg.content.toString();
                const bodyObj = JSON.parse(body) as Array<any>;
                try {
                  await SmartFunctionCallAsync(this.plugin, listener, bodyObj.splice(0,1)[0], bodyObj);
                  this.receiveChannel.channel.ack(msg);
                  //const time = Date.now() - start;
                  // this.log.reportStat(
                  //     `eventsrec-${this.channelKey}-${pluginName}-${event}-ok`,
                  //     time,
                  // );
                }
                catch (err: any) {
                  this.receiveChannel.channel.nack(msg, true);
                  //const time = Date.now() - start;
                  // this.log.reportStat(
                  //     `eventsrec-${this.channelKey}-${pluginName}-${event}-error`,
                  //     time,
                  // );
                  this.log.error(err.toString(), {});
                }
              },
              {noAck: false},
          );
          await iChannel.bindQueue(
              thisQueueKey,
              this.receiveChannel.exchangeName,
              rawQueueKey,
          );
          this.log.debug(`listen rabbit: [{thisQueueKey}]`, {
            thisQueueKey: rawQueueKey,
          });
        },
    );
  }

  async emitBroadcast(
      pluginName: string,
      event: string,
      traceId: string | undefined,
      args: Array<any>,
  ): Promise<void> {
    const thisQueueKey = LIB.getQueueKey(
        this.plugin,
        this.channelKey,
        pluginName,
        event,
    );
    this.log.debug(`Emit: [{thisQueueKey}]`, {
      thisQueueKey,
    });

    if (!this.publishQueuesSetup.includes(thisQueueKey)) {
      this.publishQueuesSetup.push(thisQueueKey);
      await this.publishChannel.channel.addSetup(
          async (iChannel: amqplibCore.ConfirmChannel) => {
            await iChannel.assertQueue(thisQueueKey, this.queueOpts);
            this.log.debug(`emit rabbit: [{thisQueueKey}]`, {thisQueueKey});
          },
      );
    }

    if (
        !await this.publishChannel.channel.publish(
            this.exchange.name,
            thisQueueKey,
            [traceId, ...args],
            {
              expiration: this.queueOpts.messageTtl,
              contentType: "string",
              appId: this.plugin.myId,
              timestamp: Date.now(),
            },
        )
    ) {
      throw `Cannot send msg to queue [${thisQueueKey}]`;
    }
    this.log.debug(` - EMIT: [${thisQueueKey}] - EMITTED`);
  }
}
