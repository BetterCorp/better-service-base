import {Plugin} from "../index.js";
import * as amqplib from "amqp-connection-manager";
import * as amqplibCore from "amqplib";
import {LIB, SetupChannel} from "./lib.js";
import {randomUUID} from "crypto";
import {
  SmartFunctionCallAsync,
  Observable,
} from "@bsb/base";

export class broadcast {
  private plugin: Plugin;
  private publishChannel!: SetupChannel<string>;
  private receiveChannel!: SetupChannel<string>;
  private readonly deliveryAttempts = new Map<string, number>();
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
    exclusive: true,
    autoDelete: true,
    messageTtl: 60 * 60 * 1000, // 60 min
    expires: 60 * 60 * 1000, // 60 min
  };

  constructor(plugin: Plugin) {
    this.plugin = plugin;
  }

  async init(obs: Observable) {
    obs.log.debug("Open broadcast channel ({exchangeName})", {
      exchangeName: this.exchange.name,
    });
    this.publishChannel = await LIB.setupChannel(
        this.plugin,
        obs,
        this.plugin.publishConnection,
        this.channelKey,
        this.exchange.name,
        this.exchange.type,
        this.exchangeOpts,
    );
    this.receiveChannel = await LIB.setupChannel(
        this.plugin,
        obs,
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
      obs: Observable,
      pluginName: string,
      event: string,
      listener: { (obs: Observable, args: Array<any>): Promise<void> },
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
    obs.log.debug("LISTEN: [{thisQueueKey}]", {
      thisQueueKey: rawQueueKey,
    });

    await this.receiveChannel.channel.addSetup(
        async (iChannel: amqplibCore.ConfirmChannel) => {
          await LIB.setupDeadLetterQueue(this.plugin, iChannel);
          await iChannel.assertQueue(thisQueueKey, LIB.withDeadLetter(this.plugin, this.queueOpts));
          await iChannel.consume(
              thisQueueKey,
              async (msg: amqplibCore.ConsumeMessage | null) => {
                if (msg === null) {
                  obs.log.warn("Message received on broadcast queue was null");
                  return;
                }
                const body = msg.content.toString();
                const deliveryKey = LIB.deliveryKey(msg, body);
                let listenerObs: Observable | null = null;
                try {
                  const bodyObj = JSON.parse(body) as { trace?: any; args?: Array<any> };
                  const rootObs = this.plugin.createObservableFromTrace(bodyObj.trace, {
                    pluginName,
                    event,
                  });
                  listenerObs = rootObs.startSpan("broadcast.listener", {
                    pluginName,
                    event,
                  });
                  await SmartFunctionCallAsync(this.plugin, listener, listenerObs, bodyObj.args ?? []);
                  LIB.clearDeliveryFailure(this.deliveryAttempts, deliveryKey);
                  iChannel.ack(msg);
                }
                catch (err: any) {
                  const errorObj = err instanceof Error ? err : new Error(err?.message || String(err));
                  if (listenerObs) {
                    listenerObs.error(errorObj);
                  }
                  LIB.nackOrDeadLetter(obs, iChannel, msg, this.deliveryAttempts, deliveryKey, errorObj, "broadcast listener");
                } finally {
                  if (listenerObs) {
                    listenerObs.end();
                  }
                }
              },
              {noAck: false},
          );
          await iChannel.bindQueue(
              thisQueueKey,
              this.receiveChannel.exchangeName,
              rawQueueKey,
          );
          obs.log.debug("listen rabbit: [{thisQueueKey}]", {
            thisQueueKey: rawQueueKey,
          });
        },
    );
  }

  async emitBroadcast(
      obs: Observable,
      pluginName: string,
      event: string,
      args: Array<any>,
  ): Promise<void> {
    const thisQueueKey = LIB.getQueueKey(
        this.plugin,
        this.channelKey,
        pluginName,
        event,
    );
    obs.log.debug("Emit: [{thisQueueKey}]", {
      thisQueueKey,
    });

    if (
        !await this.publishChannel.channel.publish(
            this.publishChannel.exchangeName,
            thisQueueKey,
            {
              trace: obs.trace,
              args,
            },
            {
              expiration: this.queueOpts.messageTtl,
              contentType: "string",
              messageId: randomUUID(),
              persistent: true,
              appId: this.plugin.myId,
              timestamp: Date.now(),
            },
        )
    ) {
      throw `Cannot send msg to queue [${thisQueueKey}]`;
    }
    obs.log.debug(" - EMIT: [{thisQueueKey}] - EMITTED", { thisQueueKey });
  }
}
