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
import * as winston from "winston";
import "winston-daily-rotate-file";

/**
 * Configuration schema for Winston observable
 */
export const WinstonConfigSchema = z.object({
  level: z.enum(["error", "warn", "info", "debug"]).default("info"),

  transports: z.object({
    console: z.object({
      enabled: z.boolean().default(true),
      colorize: z.boolean().default(true),
    }),

    file: z.object({
      enabled: z.boolean().default(false),
      filename: z.string().default("./logs/application.log"),
      maxsize: z.number().int().default(10485760), // 10MB
      maxFiles: z.number().int().default(5),
      tailable: z.boolean().default(true),
    }),

    dailyRotate: z.object({
      enabled: z.boolean().default(false),
      dirname: z.string().default("./logs"),
      filename: z.string().default("application-%DATE%.log"),
      datePattern: z.string().default("YYYY-MM-DD"),
      maxSize: z.string().default("20m"),
      maxFiles: z.string().default("14d"),
      zippedArchive: z.boolean().default(true),
    }),
  }),

  format: z.object({
    timestamp: z.boolean().default(true),
    json: z.boolean().default(true),
    prettyPrint: z.boolean().default(false),
  }),
});

export type WinstonConfig = z.infer<typeof WinstonConfigSchema>;

export const Config = createConfigSchema(
  {
    name: 'observable-winston',
    description: 'Winston observable plugin with console, file, and rotation transports',
    version: '9.0.0',
    image: '../../../docs/public/assets/images/bsb-logo.png',
    tags: ['winston', 'logging', 'observability', 'transports'],
    documentation: ['./docs/plugin.md'],
  },
  WinstonConfigSchema
);

/**
 * Convert BSB log level to Winston log level
 */
function bsbLevelToWinstonLevel(level: string): string {
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
 * Winston observable plugin - integrate with Winston logger
 */
export class Plugin extends BSBObservable<InstanceType<typeof Config>> {
  static Config = Config;
  private logFormatter = new LogFormatter();
  private logger!: winston.Logger;
  private isDisposed = false;

  constructor(config: BSBObservableConstructor<InstanceType<typeof Config>>) {
    super(config);
  }

  public async init(): Promise<void> {
    const transports: winston.transport[] = [];

    // Console transport
    if (this.config.transports.console.enabled) {
      const consoleFormat = this.config.transports.console.colorize
        ? winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        : winston.format.simple();

      transports.push(
        new winston.transports.Console({
          format: consoleFormat,
        })
      );
    }

    // File transport
    if (this.config.transports.file.enabled) {
      transports.push(
        new winston.transports.File({
          filename: this.config.transports.file.filename,
          maxsize: this.config.transports.file.maxsize,
          maxFiles: this.config.transports.file.maxFiles,
          tailable: this.config.transports.file.tailable,
        })
      );
    }

    // Daily rotate file transport
    if (this.config.transports.dailyRotate.enabled) {
      const DailyRotateFile = require("winston-daily-rotate-file");
      transports.push(
        new DailyRotateFile({
          dirname: this.config.transports.dailyRotate.dirname,
          filename: this.config.transports.dailyRotate.filename,
          datePattern: this.config.transports.dailyRotate.datePattern,
          maxSize: this.config.transports.dailyRotate.maxSize,
          maxFiles: this.config.transports.dailyRotate.maxFiles,
          zippedArchive: this.config.transports.dailyRotate.zippedArchive,
        })
      );
    }

    // Build format
    const formats: winston.Logform.Format[] = [];

    if (this.config.format.timestamp) {
      formats.push(winston.format.timestamp());
    }

    if (this.config.format.json) {
      formats.push(winston.format.json());
    } else if (this.config.format.prettyPrint) {
      formats.push(winston.format.prettyPrint());
    } else {
      formats.push(winston.format.simple());
    }

    // Create logger
    this.logger = winston.createLogger({
      level: this.config.level,
      format: winston.format.combine(...formats),
      transports,
    });
  }

  public async run(): Promise<void> {
    // No runtime setup needed
  }

  /**
   * Send log to Winston
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
      const winstonLevel = bsbLevelToWinstonLevel(level);

      // Build metadata object
      const metadata: any = {
        plugin: pluginName,
        trace_id: trace.t,
        span_id: trace.s,
        level,
        ...meta,
      };

      // Log to Winston
      this.logger.log(winstonLevel, formattedMessage, metadata);
    } catch (err) {
      console.error(`[observable-winston] Send error: ${(err as Error).message}`);
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
      this.logger.close();
    }
  }
}
