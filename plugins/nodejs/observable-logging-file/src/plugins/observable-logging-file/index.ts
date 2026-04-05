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
import * as av from "@anyvali/js";
import * as fs from "fs";
import * as path from "path";

/**
 * Configuration schema for file logging plugin
 */
export const FileLoggingConfigSchema = av.object({
  directory: av.optional(av.string()).default("./logs"),
  filename: av.optional(av.string()).default("application-%DATE%.log"),
  dateFormat: av.optional(av.string()).default("YYYY-MM-DD"),
  rotation: av.object({
    maxSize: av.optional(av.string()).default("10M"),
    maxFiles: av.optional(av.int32().min(0)).default(7),
    interval: av.optional(av.enum_(["daily", "hourly", "none"])).default("daily"),
    compress: av.optional(av.bool()).default(true),
  }, { unknownKeys: "strip" }),
  levels: av.object({
    debug: av.optional(av.bool()).default(true),
    info: av.optional(av.bool()).default(true),
    warn: av.optional(av.bool()).default(true),
    error: av.optional(av.bool()).default(true),
  }, { unknownKeys: "strip" }),
  format: av.object({
    timestamp: av.optional(av.bool()).default(true),
    traceInfo: av.optional(av.bool()).default(true),
    prettyPrint: av.optional(av.bool()).default(false),
  }, { unknownKeys: "strip" }),
}, { unknownKeys: "strip" });

export type FileLoggingConfig = av.Infer<typeof FileLoggingConfigSchema>;

export const Config = createConfigSchema(
  {
    name: 'observable-logging-file',
    description: 'File-based observable logging with rotation and retention controls',
    version: '9.0.0',
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
