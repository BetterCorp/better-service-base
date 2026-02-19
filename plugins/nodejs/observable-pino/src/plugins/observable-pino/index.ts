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
import pino from "pino";

/**
 * Configuration schema for Pino observable
 */
export const PinoConfigSchema = z.object({
  level: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  prettyPrint: z.object({
    enabled: z.boolean().default(false),
    colorize: z.boolean().default(true),
    translateTime: z.string().default("SYS:standard"),
    ignore: z.string().default("pid,hostname"),
  }),

  transport: z.object({
    enabled: z.boolean().default(false),
    target: z.string().optional(),
    options: z.record(z.string(), z.any()).optional(),
  }),

  serializers: z.object({
    error: z.boolean().default(true),
  }),

  base: z.record(z.string(), z.any()).optional(),
  redact: z.array(z.string()).default([]),
});

export type PinoConfig = z.infer<typeof PinoConfigSchema>;

export const Config = createConfigSchema(
  {
    name: 'observable-pino',
    description: 'Pino-based high-performance structured logging observable',
    version: '9.0.0',
    image: './observable-pino.png',
    tags: ['pino', 'logging', 'observability', 'json'],
    documentation: ['./docs/plugin.md'],
  },
  PinoConfigSchema
);

/**
 * Convert BSB log level to Pino log level
 */
function bsbLevelToPinoLevel(level: string): pino.Level {
  const normalized = level.toLowerCase();
  switch (normalized) {
    case "error":
      return "error";
    case "warn":
    case "warning":
      return "warn";
    case "info":
      return "info";
    case "debug":
      return "debug";
    default:
      return "info";
  }
}

/**
 * Pino observable plugin - high-performance JSON logger
 */
export class Plugin extends BSBObservable<InstanceType<typeof Config>> {
  static Config = Config;
  private logFormatter = new LogFormatter();
  private logger!: pino.Logger;
  private isDisposed = false;

  constructor(config: BSBObservableConstructor<InstanceType<typeof Config>>) {
    super(config);
  }

  public async init(): Promise<void> {
    const pinoOptions: pino.LoggerOptions = {
      level: this.config.level,
    };

    // Configure serializers
    if (this.config.serializers.error) {
      pinoOptions.serializers = {
        err: pino.stdSerializers.err,
        error: pino.stdSerializers.err,
      };
    }

    // Configure base fields
    if (this.config.base) {
      pinoOptions.base = this.config.base;
    }

    // Configure redaction
    if (this.config.redact.length > 0) {
      pinoOptions.redact = this.config.redact;
    }

    // Configure transport
    if (this.config.transport.enabled && this.config.transport.target) {
      pinoOptions.transport = {
        target: this.config.transport.target,
        options: this.config.transport.options || {},
      };
    }

    // Configure pretty print for development
    if (this.config.prettyPrint.enabled) {
      pinoOptions.transport = {
        target: "pino-pretty",
        options: {
          colorize: this.config.prettyPrint.colorize,
          translateTime: this.config.prettyPrint.translateTime,
          ignore: this.config.prettyPrint.ignore,
        },
      };
    }

    // Create logger
    this.logger = pino(pinoOptions);
  }

  public async run(): Promise<void> {
    // No runtime setup needed
  }

  /**
   * Send log to Pino
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
      const pinoLevel = bsbLevelToPinoLevel(level);

      // Build context object
      const context: any = {
        plugin: pluginName,
        trace_id: trace.t,
        span_id: trace.s,
        ...meta,
      };

      // Log to Pino
      this.logger[pinoLevel](context, formattedMessage);
    } catch (err) {
      console.error(`[observable-pino] Send error: ${(err as Error).message}`);
    }
  }

  // Logging methods
  public debug(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void {
    if (this.mode === "production") {
      return;
    }
    this.sendLog("debug", trace, pluginName, message, meta);
  }

  public info(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void {
    this.sendLog("info", trace, pluginName, message, meta);
  }

  public warn(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void {
    this.sendLog("warn", trace, pluginName, message, meta);
  }

  public error(trace: DTrace, pluginName: string, message: string | BSBError<any>, meta?: LogMeta<any>): void {
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
    if (this.logger) {
      this.logger.flush();
    }
  }
}
