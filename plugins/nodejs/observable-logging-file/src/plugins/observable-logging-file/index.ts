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
import { createStream, RotatingFileStream } from "rotating-file-stream";
import * as av from "anyvali";
import * as fs from "fs";
import * as path from "path";

/**
 * Configuration schema for file logging plugin
 */
export const FileLoggingConfigSchema = av.object({
  directory: av.string().default("./logs").describe("Directory where log files are written"),
  filename: av.string().default("application-%DATE%.log").describe("Log filename pattern, supporting the %DATE% token"),
  dateFormat: av.string().default("YYYY-MM-DD").describe("Date format used when replacing the %DATE% filename token"),
  rotation: av.object({
    maxSize: av.string().default("10M").describe("Maximum log file size before rotation"),
    maxFiles: av.int32().min(0).default(7).describe("Maximum number of rotated files to retain, or 0 for no limit"),
    interval: av.enum_(["daily", "hourly", "none"]).default("daily").describe("Time-based log rotation interval"),
    compress: av.bool().default(true).describe("Whether rotated log files are compressed"),
  }, { unknownKeys: "strip" }).describe("File rotation and retention settings"),
  levels: av.object({
    debug: av.bool().default(true).describe("Whether debug logs are written to file"),
    info: av.bool().default(true).describe("Whether info logs are written to file"),
    warn: av.bool().default(true).describe("Whether warning logs are written to file"),
    error: av.bool().default(true).describe("Whether error logs are written to file"),
  }, { unknownKeys: "strip" }).describe("Log level enablement"),
  format: av.object({
    timestamp: av.bool().default(true).describe("Whether log entries include a timestamp"),
    traceInfo: av.bool().default(true).describe("Whether log entries include trace and span identifiers"),
    prettyPrint: av.bool().default(false).describe("Whether log entries are formatted for human-readable output"),
  }, { unknownKeys: "strip" }).describe("Log entry formatting settings"),
}, { unknownKeys: "strip" }).describe("File logging observable plugin configuration");

export type FileLoggingConfig = av.Infer<typeof FileLoggingConfigSchema>;

export const Config = createConfigSchema(
  {
    name: 'observable-logging-file',
    description: 'File-based observable logging with rotation and retention controls',
    image: './observable-logging-file.png',
    tags: ['logging', 'file', 'rotation', 'observability'],
    documentation: ['./docs/plugin.md'],
  },
  FileLoggingConfigSchema
);

/**
 * Parse size string to bytes (e.g., "10M", "100K", "1G")
 */
function parseSize(size: string): string {
  const match = size.match(/^(\d+(?:\.\d+)?)\s*([KMGT]?)B?$/i);
  if (!match) {
    return "10M"; // Default fallback
  }
  return match[1] + (match[2] || "").toUpperCase();
}

/**
 * File logging observable plugin with rotation and compression
 */
export class Plugin extends BSBObservable<InstanceType<typeof Config>> {
  static Config = Config;
  private logFormatter = new LogFormatter();
  private logStream: RotatingFileStream | null = null;
  private isDisposed = false;

  constructor(config: BSBObservableConstructor<InstanceType<typeof Config>>) {
    super(config);
  }

  public async run(): Promise<void> {
    // No runtime setup needed for file logger
  }

  public async init(): Promise<void> {
    // Create log directory if it doesn't exist
    const logDir = path.resolve(this.config.directory);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Replace %DATE% token with actual date pattern
    const filename = this.config.filename.replace(
      /%DATE%/g,
      this.config.dateFormat.toLowerCase()
    );

    // Configure rotation options
    const rotateOptions: any = {
      size: parseSize(this.config.rotation.maxSize),
      compress: this.config.rotation.compress ? "gzip" : false,
    };

    // Set interval if not "none"
    if (this.config.rotation.interval === "daily") {
      rotateOptions.interval = "1d";
    } else if (this.config.rotation.interval === "hourly") {
      rotateOptions.interval = "1h";
    }

    // Set max files for retention
    if (this.config.rotation.maxFiles > 0) {
      rotateOptions.maxFiles = this.config.rotation.maxFiles;
    }

    // Create rotating file stream
    this.logStream = createStream(filename, {
      ...rotateOptions,
      path: logDir,
    });

    // Handle stream errors
    this.logStream.on("error", (err) => {
      console.error(`[observable-logging-file] Stream error: ${err.message}`);
    });
  }

  /**
   * Write log entry to file
   */
  private writeLog(
    level: string,
    trace: DTrace,
    pluginName: string,
    message: string,
    meta?: LogMeta<any>
  ): void {
    if (this.isDisposed || !this.logStream) {
      return;
    }

    const formattedMessage = this.logFormatter.formatLog(trace, message, meta);
    const logEntry = this.config.format.prettyPrint
      ? this.formatText(level, pluginName, trace, formattedMessage)
      : this.formatJSON(level, pluginName, trace, formattedMessage, meta);

    try {
      this.logStream.write(logEntry + "\n");
    } catch (err) {
      console.error(`[observable-logging-file] Write error: ${(err as Error).message}`);
    }
  }

  /**
   * Format log entry as text
   */
  private formatText(
    level: string,
    pluginName: string,
    trace: DTrace,
    message: string
  ): string {
    const timestamp = this.config.format.timestamp ? new Date().toISOString() : "";
    const parts: string[] = [];

    if (timestamp) {
      parts.push(timestamp);
    }

    parts.push(`[${level.toUpperCase()}]`);
    parts.push(`[${pluginName.toUpperCase()}]`);
    parts.push(message);

    return parts.join(" | ");
  }

  /**
   * Format log entry as JSON
   */
  private formatJSON(
    level: string,
    pluginName: string,
    trace: DTrace,
    message: string,
    meta?: LogMeta<any>
  ): string {
    const logEntry: any = {
      level: level.toUpperCase(),
      plugin: pluginName,
      message,
    };

    if (this.config.format.timestamp) {
      logEntry.timestamp = new Date().toISOString();
    }

    if (this.config.format.traceInfo) {
      logEntry.trace = {
        t: trace.t,
        s: trace.s,
      };
    }

    if (meta && Object.keys(meta).length > 0) {
      logEntry.meta = meta;
    }

    return JSON.stringify(logEntry);
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
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }
}
