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
import * as winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

/**
 * Configuration schema for Winston observable
 */
export const WinstonConfigSchema = av.object({
  level: av.enum_(["error", "warn", "info", "debug"]).default("info").describe("Minimum Winston log level"),
  transports: av.object({
    console: av.object({
      enabled: av.bool().default(true).describe("Whether console logging is enabled"),
      colorize: av.bool().default(true).describe("Whether console logs use terminal colors"),
    }, { unknownKeys: "strip" }).describe("Winston console transport settings"),
    file: av.object({
      enabled: av.bool().default(false).describe("Whether fixed file logging is enabled"),
      filename: av.string().default("./logs/application.log").describe("File path for fixed file logging"),
      maxsize: av.int32().default(10485760).describe("Maximum file size in bytes before rotation"),
      maxFiles: av.int32().default(5).describe("Maximum number of rotated fixed log files to retain"),
      tailable: av.bool().default(true).describe("Whether fixed file rotation uses tailable filenames"),
    }, { unknownKeys: "strip" }).describe("Winston fixed file transport settings"),
    dailyRotate: av.object({
      enabled: av.bool().default(false).describe("Whether daily rotating file logging is enabled"),
      dirname: av.string().default("./logs").describe("Directory where rotating log files are written"),
      filename: av.string().default("application-%DATE%.log").describe("Rotating log filename pattern"),
      datePattern: av.string().default("YYYY-MM-DD").describe("Date pattern used by the rotating file transport"),
      maxSize: av.string().default("20m").describe("Maximum rotating log file size"),
      maxFiles: av.string().default("14d").describe("Rotating log retention window or file count"),
      zippedArchive: av.bool().default(true).describe("Whether rotated log files are compressed"),
    }, { unknownKeys: "strip" }).describe("Winston daily rotating file transport settings"),
  }, { unknownKeys: "strip" }).describe("Winston transport settings"),
  format: av.object({
    timestamp: av.bool().default(true).describe("Whether log entries include timestamps"),
    json: av.bool().default(true).describe("Whether logs are emitted as JSON"),
    prettyPrint: av.bool().default(false).describe("Whether logs use human-readable formatting"),
  }, { unknownKeys: "strip" }).describe("Winston log format settings"),
}, { unknownKeys: "strip" }).describe("Winston observable plugin configuration");

export type WinstonConfig = av.Infer<typeof WinstonConfigSchema>;

export const Config = createConfigSchema(
  {
    name: 'observable-winston',
    description: 'Winston observable plugin with console, file, and rotation transports',
    image: './observable-winston.png',
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
