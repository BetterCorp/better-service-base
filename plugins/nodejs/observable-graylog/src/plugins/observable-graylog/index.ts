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
import * as av from "anyvali";
import dgram from "node:dgram";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import { gzipSync } from "node:zlib";

/**
 * Configuration schema for Graylog observable
 */
export const GraylogConfigSchema = av.object({
  host: av.string().default("localhost").describe("Graylog server hostname"),
  port: av.int32().min(1).max(65535).default(12201).describe("Graylog GELF server port"),
  protocol: av.enum_(["udp", "tcp", "http"]).default("udp").describe("Transport protocol used to send GELF messages"),
  httpEndpoint: av.optional(av.string().format("url")).describe("HTTP GELF endpoint used when protocol is http"),
  facility: av.string().default("bsb").describe("GELF facility field value"),
  additionalFields: av.optional(av.record(av.union([
    av.string().describe("String additional field value"),
    av.number().describe("Numeric additional field value"),
    av.bool().describe("Boolean additional field value"),
  ]))).default({}).describe("Additional static GELF fields added to every log message"),
  compress: av.bool().default(true).describe("Whether UDP GELF message compression is enabled"),
  levels: av.object({
    debug: av.bool().default(true).describe("Whether debug logs are sent to Graylog"),
    info: av.bool().default(true).describe("Whether info logs are sent to Graylog"),
    warn: av.bool().default(true).describe("Whether warning logs are sent to Graylog"),
    error: av.bool().default(true).describe("Whether error logs are sent to Graylog"),
  }, { unknownKeys: "strip" }).describe("Log level enablement"),
}, { unknownKeys: "strip" }).describe("Graylog observable plugin configuration");

export type GraylogConfig = av.Infer<typeof GraylogConfigSchema>;

export const Config = createConfigSchema(
  {
    name: 'observable-graylog',
    description: 'Graylog GELF observable plugin for centralized log ingestion',
    image: './observable-graylog.png',
    tags: ['graylog', 'gelf', 'observability', 'logging'],
    documentation: ['./docs/plugin.md'],
  },
  GraylogConfigSchema
);

/**
 * Convert BSB log level to GELF/syslog severity level
 */
function bsbLevelToGelfLevel(level: string): number {
  const normalized = level.toLowerCase();
  switch (normalized) {
    case "error":
      return 3; // Error
    case "warn":
    case "warning":
      return 4; // Warning
    case "info":
      return 6; // Informational
    case "debug":
      return 7; // Debug
    default:
      return 6; // Informational
  }
}

/**
 * Graylog (GELF) observable plugin - sends logs to Graylog servers
 */
export class Plugin extends BSBObservable<InstanceType<typeof Config>> {
  static Config = Config;
  private logFormatter = new LogFormatter();
  private isDisposed = false;
  private defaultFields: Record<string, string | number | boolean> = {};

  constructor(config: BSBObservableConstructor<InstanceType<typeof Config>>) {
    super(config);
  }

  public async init(): Promise<void> {
    this.defaultFields = {
      facility: this.config.facility,
      ...this.config.additionalFields,
    };
  }

  public async run(): Promise<void> {
    // No runtime setup needed
  }

  /**
   * Send log to Graylog
   */
  private sendLog(
    level: string,
    trace: DTrace,
    pluginName: string,
    message: string,
    meta?: LogMeta<any>
  ): void {
    if (this.isDisposed) {
      return;
    }

    try {
      const formattedMessage = this.logFormatter.formatLog(trace, message, meta);
      const gelfLevel = bsbLevelToGelfLevel(level);

      // Build GELF extra fields (GELF uses underscore prefix for custom fields)
      const extraFields: any = {
        _plugin: pluginName,
        _trace_id: trace.t,
        _span_id: trace.s,
        _level: level,
      };

      // Add metadata fields with underscore prefix (GELF convention)
      if (meta) {
        for (const [key, value] of Object.entries(meta)) {
          if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            extraFields[`_${key}`] = value;
          } else {
            extraFields[`_${key}`] = JSON.stringify(value);
          }
        }
      }

      this.sendGelfMessage(formattedMessage, gelfLevel, extraFields);
    } catch (err) {
      console.error(`[observable-graylog] Send error: ${(err as Error).message}`);
    }
  }

  private sendGelfMessage(
    shortMessage: string,
    level: number,
    extraFields: Record<string, string | number | boolean>
  ): void {
    const payload = JSON.stringify({
      version: "1.1",
      host: os.hostname(),
      short_message: shortMessage,
      timestamp: Date.now() / 1000,
      level,
      ...this.defaultFields,
      ...extraFields,
    });

    if (this.config.protocol === "http") {
      this.sendHttp(payload);
      return;
    }

    if (this.config.protocol === "tcp") {
      this.sendTcp(payload);
      return;
    }

    this.sendUdp(payload);
  }

  private sendUdp(payload: string): void {
    const socket = dgram.createSocket("udp4");
    const message = this.config.compress ? gzipSync(Buffer.from(payload)) : Buffer.from(payload);
    socket.send(message, this.config.port, this.config.host, (err) => {
      socket.close();
      if (err) {
        console.error(`[observable-graylog] Failed to send UDP log: ${err.message}`);
      }
    });
  }

  private sendTcp(payload: string): void {
    const socket = net.createConnection({ host: this.config.host, port: this.config.port }, () => {
      socket.end(`${payload}\0`);
    });
    socket.on("error", (err) => {
      console.error(`[observable-graylog] Failed to send TCP log: ${err.message}`);
    });
  }

  private sendHttp(payload: string): void {
    const endpoint = new URL(this.config.httpEndpoint ?? `http://${this.config.host}:${this.config.port}/gelf`);
    const body = Buffer.from(payload);
    const client = endpoint.protocol === "https:" ? https : http;
    const req = client.request(
      endpoint,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": body.byteLength,
        },
      },
      (res) => {
        res.resume();
      }
    );
    req.on("error", (err) => {
      console.error(`[observable-graylog] Failed to send HTTP log: ${err.message}`);
    });
    req.end(body);
  }

  // Logging methods
  public debug(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void {
    if (this.mode === "production" || !this.config.levels.debug) {
      return;
    }
    this.sendLog("debug", trace, pluginName, message, meta);
  }

  public info(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void {
    if (!this.config.levels.info) {
      return;
    }
    this.sendLog("info", trace, pluginName, message, meta);
  }

  public warn(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void {
    if (!this.config.levels.warn) {
      return;
    }
    this.sendLog("warn", trace, pluginName, message, meta);
  }

  public error(trace: DTrace, pluginName: string, message: string | BSBError<any>, meta?: LogMeta<any>): void {
    if (!this.config.levels.error) {
      return;
    }

    if (message instanceof BSBError) {
      if (message.raw !== null) {
        this.sendLog("error", message.raw.trace, pluginName, message.raw.message, message.raw.meta);
      } else {
        this.sendLog("error", trace, pluginName, message.message);
      }
    } else {
      this.sendLog("error", trace, pluginName, message, meta);
    }
  }

  public dispose(): void {
    this.isDisposed = true;
  }
}
