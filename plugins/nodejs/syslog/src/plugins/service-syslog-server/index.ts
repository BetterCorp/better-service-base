/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.
 * Copyright (C) 2016 - 2025 BetterCorp (PTY) Ltd
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Alternatively, you may obtain a commercial license for this program.
 * The commercial license allows you to use the Program in a closed-source manner,
 * including the right to create derivative works that are not subject to the terms
 * of the AGPL.
 *
 * To obtain a commercial license, please contact the copyright holders at
 * https://www.bettercorp.dev. The terms and conditions of the commercial license
 * will be provided upon request.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { BSBService, BSBServiceConstructor, BSBServiceClient, createConfigSchema, bsb } from "@bsb/base";
import { Observable } from "@bsb/base";
import * as av from "@anyvali/js";
import { createFireAndForgetEvent } from "@bsb/base";
// @ts-ignore - no types available
import SyslogServer from "syslog-server";

/**
 * Syslog message structure
 */
export const SyslogMessageSchema = av.object({
  gatewayTime: av.number(),
  date: av.number(),
  host: av.string(),
  protocol: av.string(),
  message: av.string(),
}, { unknownKeys: "strip" });

export type SyslogMessage = av.Infer<typeof SyslogMessageSchema>;

/**
 * Configuration schema for syslog server
 */
export const SyslogServerConfigSchema = av.object({
  port: av.optional(av.int32().min(1).max(65535)).default(514),
  address: av.optional(av.string()).default("0.0.0.0"),
  exclusive: av.optional(av.bool()).default(false),
}, { unknownKeys: "strip" });

export type SyslogServerConfig = av.Infer<typeof SyslogServerConfigSchema>;

export const Config = createConfigSchema(
  {
    name: 'service-syslog-server',
    description: 'Syslog server service plugin that receives messages and emits events',
    version: '9.0.0',
    image: './assets/syslog-icon.png',
    tags: ['syslog', 'server', 'service', 'events'],
  },
  SyslogServerConfigSchema
);

/**
 * Event schemas for syslog server
 */
export const EventSchemas = {
  emitEvents: {
    onMessage: createFireAndForgetEvent(
      bsb.object({
        gatewayTime: bsb.number({ description: "Gateway timestamp (epoch ms)" }),
        date: bsb.number({ description: "Original syslog timestamp (epoch ms)" }),
        host: bsb.string({ description: "Source host" }),
        protocol: bsb.string({ description: "Transport protocol" }),
        message: bsb.string({ description: "Syslog message content" }),
      }, "Syslog message payload"),
      "Syslog message received from client"
    ),
  },
  onEvents: {},
  emitReturnableEvents: {},
  onReturnableEvents: {},
  emitBroadcast: {},
  onBroadcast: {},
} as const;

/**
 * Syslog server service plugin - receives syslog messages
 */
export class Plugin extends BSBService<InstanceType<typeof Config>, typeof EventSchemas> {
  static Config = Config;
  static EventSchemas = EventSchemas;
  public initBeforePlugins?: string[] | undefined;
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;

  private _server: any;

  constructor(config: BSBServiceConstructor<InstanceType<typeof Config>, typeof EventSchemas>) {
    super({
      ...config,
      eventSchemas: EventSchemas,
    });
  }

  public async init(): Promise<void> {
    // No initialization needed
  }

  public async run(obs: Observable): Promise<void> {
    this._server = new SyslogServer();

    this._server.on("message", (value: any) => {
      obs.log.info(
        "Syslog message from {host}: {message}",
        {
          host: value.host,
          message: value.message,
        }
      );

      this.events.emitEvent("onMessage", obs, {
        gatewayTime: Date.now(),
        date: new Date(value.date).getTime(),
        host: value.host,
        protocol: value.protocol,
        message: value.message,
      });
    });

    this._server.start({
      port: this.config.port,
      address: this.config.address,
      exclusive: this.config.exclusive,
    });

    obs.log.info("Syslog server listening on {address}:{port}", {
      address: this.config.address,
      port: this.config.port.toString(),
    });
  }

  public dispose(): void {
    if (this._server) {
      this._server.stop();
      this._server = null;
    }
  }
}

/**
 * Syslog server client - allows other services to subscribe to syslog messages
 */
export class Client extends BSBServiceClient<Plugin> {
  public initBeforePlugins?: string[] | undefined;
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;
  public dispose?(): void;
  public run?(): Promise<void>;
  public readonly pluginName: string = "service-syslog-server";

  public async init(obs: Observable): Promise<void> {
    // Clients can subscribe to onMessage event to receive syslog messages
    // Example:
    // this.events.onEvent("onMessage", obs, async (obs, message) => {
    //   obs.log.info("Received syslog: {message}", { message: message.message });
    // });
  }
}
