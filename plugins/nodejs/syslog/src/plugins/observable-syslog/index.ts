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

import { BSBObservable, BSBObservableConstructor, createConfigSchema, LogFormatter, BSBError } from "@bsb/base";
import { DTrace, LogMeta } from "@bsb/base";
import { z } from "zod";
// @ts-ignore - no types available
import * as SyslogClient from "syslog-client";

/**
 * Configuration schema for syslog client observable
 */
export const SyslogClientConfigSchema = z.object({
  host: z.string().default("localhost"),
  port: z.number().int().min(1).max(65535).default(514),
  protocol: z.enum(["udp", "tcp", "tls"]).default("udp"),

  tls: z.object({
    rejectUnauthorized: z.boolean().default(true),
    ca: z.string().optional(),
    cert: z.string().optional(),
    key: z.string().optional(),
  }).optional(),

  facility: z.number().int().min(0).max(23).default(16), // local0
  hostname: z.string().optional(),
  appName: z.string().default("bsb-app"),
  rfc: z.enum(["3164", "5424"]).default("5424"),

  // Log level filtering
  levels: z.object({
    debug: z.boolean().default(true),
    info: z.boolean().default(true),
    warn: z.boolean().default(true),
    error: z.boolean().default(true),
  }),
});

export type SyslogClientConfig = z.infer<typeof SyslogClientConfigSchema>;

export const Config = createConfigSchema(
  {
    name: 'observable-syslog',
    description: 'Syslog client observable plugin for forwarding logs to syslog servers',
    version: '9.0.0',
    image: '../../../docs/public/assets/images/bsb-logo.png',
    tags: ['syslog', 'logging', 'observable', 'network'],
  },
  SyslogClientConfigSchema
);

/**
 * Convert BSB log level to syslog severity
 */
function bsbLevelToSyslogSeverity(level: string): number {
  const normalized = level.toLowerCase();
  switch (normalized) {
    case "error":
      return SyslogClient.Severity.Error;
    case "warn":
    case "warning":
      return SyslogClient.Severity.Warning;
    case "info":
      return SyslogClient.Severity.Informational;
    case "debug":
      return SyslogClient.Severity.Debug;
    default:
      return SyslogClient.Severity.Informational;
  }
}

/**
 * Syslog client observable plugin - sends logs to syslog servers
 */
export class Plugin extends BSBObservable<InstanceType<typeof Config>> {
  static Config = Config;
  private logFormatter = new LogFormatter();
  private client: any = null;
  private isDisposed = false;

  constructor(config: BSBObservableConstructor<InstanceType<typeof Config>>) {
    super(config);
  }

  public async init(): Promise<void> {
    const options: any = {
      syslogHostname: this.config.hostname || require("os").hostname(),
      appName: this.config.appName,
      facility: this.config.facility,
      rfc: this.config.rfc === "3164" ? SyslogClient.RFC3164 : SyslogClient.RFC5424,
    };

    if (this.config.protocol === "tcp") {
      options.transport = SyslogClient.Transport.Tcp;
    } else if (this.config.protocol === "tls") {
      options.transport = SyslogClient.Transport.Tls;
      if (this.config.tls) {
        options.tlsOptions = {
          rejectUnauthorized: this.config.tls.rejectUnauthorized,
          ca: this.config.tls.ca,
          cert: this.config.tls.cert,
          key: this.config.tls.key,
        };
      }
    } else {
      options.transport = SyslogClient.Transport.Udp;
    }

    this.client = SyslogClient.createClient(this.config.host, options);

    // Handle connection errors
    this.client.on("error", (err: Error) => {
      console.error(`[observable-syslog] Connection error: ${err.message}`);
    });
  }

  public async run(): Promise<void> {
    // No runtime setup needed
  }

  /**
   * Send log to syslog server
   */
  private sendLog(severity: number, message: string): void {
    if (this.isDisposed || !this.client) {
      return;
    }

    try {
      this.client.log(message, { severity }, (err: Error | null) => {
        if (err) {
          console.error(`[observable-syslog] Failed to send log: ${err.message}`);
        }
      });
    } catch (err) {
      console.error(`[observable-syslog] Send error: ${(err as Error).message}`);
    }
  }

  /**
   * Format and send log
   */
  private writeLog(
    level: string,
    trace: DTrace,
    pluginName: string,
    message: string,
    meta?: LogMeta<any>
  ): void {
    if (this.isDisposed) {
      return;
    }

    const formattedMessage = this.logFormatter.formatLog(trace, message, meta);
    const fullMessage = `[${pluginName.toUpperCase()}] ${formattedMessage}`;
    const severity = bsbLevelToSyslogSeverity(level);

    this.sendLog(severity, fullMessage);
  }

  // Logging methods
  public debug(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void {
    if (this.mode === "production" || !this.config.levels.debug) {
      return;
    }
    this.writeLog("debug", trace, pluginName, message, meta);
  }

  public info(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void {
    if (!this.config.levels.info) {
      return;
    }
    this.writeLog("info", trace, pluginName, message, meta);
  }

  public warn(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void {
    if (!this.config.levels.warn) {
      return;
    }
    this.writeLog("warn", trace, pluginName, message, meta);
  }

  public error(trace: DTrace, pluginName: string, message: string | BSBError<any>, meta?: LogMeta<any>): void {
    if (!this.config.levels.error) {
      return;
    }

    if (message instanceof BSBError) {
      if (message.raw !== null) {
        this.writeLog("error", message.raw.trace, pluginName, message.raw.message, message.raw.meta);
      } else {
        this.writeLog("error", trace, pluginName, message.message);
      }
    } else {
      this.writeLog("error", trace, pluginName, message, meta);
    }
  }

  public dispose(): void {
    this.isDisposed = true;
    if (this.client) {
      this.client.close();
      this.client = null;
    }
  }
}
