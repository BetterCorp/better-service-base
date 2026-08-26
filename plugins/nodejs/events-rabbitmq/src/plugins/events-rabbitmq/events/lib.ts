import * as amqplib from "amqp-connection-manager";
import * as amqplibCore from "amqplib";
import { Plugin } from "../index.js";
import { Observable } from "@bsb/base";

export interface SetupChannel<T extends string | null = string | null> {
  exchangeName: T;
  channel: amqplib.ChannelWrapper;
}

const isNil = (value: unknown) => value === null || value === undefined;
export class LIB {
  public static readonly MAX_DELIVERY_ATTEMPTS = 10;
  public static readonly deadLetterExchange = "better.service9.deadletter";
  public static readonly deadLetterQueue = "better.service9.deadletter";

  public static getQueueKey(
    plugin: Plugin,
    channelKey: string,
    pluginName: string,
    event: string,
    addKey?: string
  ) {
    return `${plugin.getPlatformName(channelKey)}-${pluginName}-${event}${
      isNil(addKey) ? "" : `-${addKey}`
    }`;
  }
  public static getMyQueueKey(
    plugin: Plugin,
    channelKey: string,
    id: string,
    addKey?: string
  ) {
    return `${plugin.getPlatformName(channelKey)}-${id}${
      isNil(addKey) ? "" : `-${addKey}`
    }`;
  }
  public static async setupChannel<T extends string | null>(
    plugin: Plugin,
    obs: Observable | null,
    connection: amqplib.AmqpConnectionManager,
    queueKey: string,
    exchangeName: T,
    exType?: string,
    exOpts?: amqplib.Options.AssertExchange,
    prefetch?: number,
    json: boolean = true
  ): Promise<SetupChannel<T>> {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve) => {
      const exName =
        isNil(exchangeName) || isNil(exType)
          ? null
          : plugin.getPlatformName(exchangeName);
      let returned = false;
      obs?.log.debug("Create channel ({queueKey})", { queueKey });
      const channel = await connection.createChannel({
        json,
        setup: async (ichannel: amqplibCore.ConfirmChannel) => {
          if (exName !== null)
            await ichannel.assertExchange(exName, exType!, exOpts);
          if (!isNil(prefetch)) {
            obs?.log.debug("prefetch ({queueKey}) {prefetch}", {
              queueKey,
              prefetch: prefetch!,
            });
            await ichannel.prefetch(prefetch!);
          }
          obs?.log.debug("setup exchange ({queueKey}) OK", {
            queueKey,
          });
          if (!returned) {
            resolve({
              exchangeName: exName as T,
              channel,
            });
            returned = true;
          }
        },
      });
      channel.on("close", () => {
        obs?.log.warn("AMQP channel ({queueKey}) close", { queueKey });
      });
      channel.on("error", (err: any) => {
        obs?.log.error("AMQP channel ({queueKey}) error: {err}", {
          queueKey,
          err: err.message || err,
        });
        throw new Error(`AMQP channel (${queueKey}) error: ${err.message || err}`);
      });
      if (exName !== null)
        obs?.log.debug("Assert exchange ({queueKey}) {exName} {exType}", {
          queueKey,
          exName,
          exType: exType!,
        });
      obs?.log.debug("Ready ({queueKey})", { queueKey });
    });
  }

  public static withDeadLetter(
    plugin: Plugin,
    opts: amqplib.Options.AssertQueue
  ): amqplib.Options.AssertQueue {
    return {
      ...opts,
      deadLetterExchange: plugin.getPlatformName(LIB.deadLetterExchange),
    };
  }

  public static async setupDeadLetterQueue(
    plugin: Plugin,
    channel: amqplibCore.ConfirmChannel
  ): Promise<void> {
    const exchange = plugin.getPlatformName(LIB.deadLetterExchange);
    const queue = plugin.getPlatformName(LIB.deadLetterQueue);
    await channel.assertExchange(exchange, "topic", { durable: true });
    await channel.assertQueue(queue, {
      durable: true,
      autoDelete: false,
      messageTtl: 7 * 24 * 60 * 60 * 1000,
    });
    await channel.bindQueue(queue, exchange, "#");
  }

  public static deliveryKey(msg: amqplibCore.ConsumeMessage, body: string): string {
    return msg.properties.messageId || `${msg.fields.routingKey}:${body}`;
  }

  public static clearDeliveryFailure(
    attempts: Map<string, number>,
    key: string
  ): void {
    attempts.delete(key);
  }

  public static nackOrDeadLetter(
    obs: Observable,
    channel: amqplibCore.ConfirmChannel,
    msg: amqplibCore.ConsumeMessage,
    attempts: Map<string, number>,
    key: string,
    err: Error,
    label: string
  ): void {
    const attempt = (attempts.get(key) ?? 0) + 1;
    const requeue = attempt < LIB.MAX_DELIVERY_ATTEMPTS;
    if (requeue) {
      attempts.set(key, attempt);
    } else {
      attempts.delete(key);
    }
    channel.nack(msg, false, requeue);
    obs.log.error("{label} error ({attempt}/{maxAttempts}, requeue={requeue}): {err}", {
      label,
      attempt,
      maxAttempts: LIB.MAX_DELIVERY_ATTEMPTS,
      requeue,
      err: err.message,
    });
  }
}
