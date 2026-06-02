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
}
