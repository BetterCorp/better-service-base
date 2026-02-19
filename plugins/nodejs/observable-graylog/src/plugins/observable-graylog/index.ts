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
import * as gelfPro from "gelf-pro";

/**
 * Configuration schema for Graylog observable
 */
export const GraylogConfigSchema = z.object({
  host: z.string().default("localhost"),
  port: z.number().int().min(1).max(65535).default(12201),
  protocol: z.enum(["udp", "tcp", "http"]).default("udp"),

  // HTTP-specific settings
  httpEndpoint: z.string().url().optional(),

  // GELF settings
  facility: z.string().default("bsb"),

  // Additional fields to include in all messages
  additionalFields: z.record(z.string(), z.union([
    z.string(),
    z.number(),
    z.boolean(),
  ])).default({}),

  // Compression (for UDP/TCP)
  compress: z.boolean().default(true),

  // Log level filtering
  levels: z.object({
    debug: z.boolean().default(true),
    info: z.boolean().default(true),
    warn: z.boolean().default(true),
    error: z.boolean().default(true),
  }),
});

export type GraylogConfig = z.infer<typeof GraylogConfigSchema>;

export const Config = createConfigSchema(
  {
    name: 'observable-graylog',
    description: 'Graylog GELF observable plugin for centralized log ingestion',
    version: '9.0.0',
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

  constructor(config: BSBObservableConstructor<InstanceType<typeof Config>>) {
    super(config);
  }

  public async init(): Promise<void> {
    // Configure gelf-pro adapter
    const adapterName = this.config.protocol === "tcp" ? "tcp" : "udp";

    const adapterOptions: any = {
      host: this.config.host,
      port: this.config.port,
    };

    // Set default fields including facility
    const fields: any = {
      facility: this.config.facility,
      ...this.config.additionalFields,
    };

    // Initialize gelf-pro
    gelfPro.setConfig({
      adapterName,
      adapterOptions,
      fields,
    });
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

      // Send to Graylog using the message method
      gelfPro.message(formattedMessage, gelfLevel, extraFields, (err?: Error) => {
        if (err) {
          console.error(`[observable-graylog] Failed to send log: ${err.message}`);
        }
      });
    } catch (err) {
      console.error(`[observable-graylog] Send error: ${(err as Error).message}`);
    }
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
    // gelf-pro doesn't require explicit cleanup
  }
}
