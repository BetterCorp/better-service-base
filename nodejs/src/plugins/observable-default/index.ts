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

import { BSBObservable, BSBObservableConstructor, LogFormatter, BSBError, createConfigSchema } from "../../base";
import { DTrace, LogMeta } from "../../interfaces";
import { z } from "zod";

// Console colours for log output
const CONSOLE_COLOURS = {
  Reset: "\x1b[0m",
  Bright: "\x1b[1m",
  Dim: "\x1b[2m",
  Underscore: "\x1b[4m",
  Blink: "\x1b[5m",
  Reverse: "\x1b[7m",
  Hidden: "\x1b[8m",
  FgBlack: "\x1b[30m",
  FgRed: "\x1b[31m",
  FgGreen: "\x1b[32m",
  FgYellow: "\x1b[33m",
  FgBlue: "\x1b[34m",
  FgMagenta: "\x1b[35m",
  FgCyan: "\x1b[36m",
  FgWhite: "\x1b[37m",
  BgBlack: "\x1b[40m",
  BgRed: "\x1b[41m",
  BgGreen: "\x1b[42m",
  BgYellow: "\x1b[43m",
  BgBlue: "\x1b[44m",
  BgMagenta: "\x1b[45m",
  BgCyan: "\x1b[46m",
  BgWhite: "\x1b[47m",
} as const;

type ConsoleColours = (typeof CONSOLE_COLOURS)[keyof typeof CONSOLE_COLOURS];

const LOG_LEVELS = {
  DEBUG: "debug",
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
} as const;

type LogLevels = (typeof LOG_LEVELS)[keyof typeof LOG_LEVELS];

export const Config = createConfigSchema(
  {
    name: "observable-default",
    description: "Default console observable plugin for logging output",
    version: "1.0.0",
    image: "../docs/public/assets/images/bsb-logo.png",
    tags: ["core", "observable", "default", "console"],
    documentation: ["./docs/core-plugins/observable-default.md"],
  },
  z.object({})
);

export class Plugin extends BSBObservable<InstanceType<typeof Config>> {
  static Config = Config;
  private logFormatter = new LogFormatter();

  constructor(config: BSBObservableConstructor<InstanceType<typeof Config>>) {
    super(config);
  }

  private formatLog<T extends string>(
    level: LogLevels,
    plugin: string,
    trace: DTrace,
    message: T,
    meta?: LogMeta<T>
  ): void {
    let formattedMessage = this.logFormatter.formatLog<T>(trace, message, meta);
    formattedMessage = `[${plugin.toUpperCase()}] ${formattedMessage}`;

    type ConsoleMethod = typeof console.debug | typeof console.log | typeof console.warn | typeof console.error;
    let func: ConsoleMethod = console.debug;
    let colour: Array<ConsoleColours> = [];

    switch (level) {
      case LOG_LEVELS.DEBUG:
        formattedMessage = `[DEBUG] ${formattedMessage}`;
        func = console.debug;
        colour = [CONSOLE_COLOURS.BgBlue, CONSOLE_COLOURS.FgWhite];
        break;
      case LOG_LEVELS.INFO:
        formattedMessage = `[INFO] ${formattedMessage}`;
        func = console.log;
        break;
      case LOG_LEVELS.WARN:
        formattedMessage = `[WARN] ${formattedMessage}`;
        func = console.warn;
        colour = [CONSOLE_COLOURS.BgBlack, CONSOLE_COLOURS.FgRed];
        break;
      case LOG_LEVELS.ERROR:
        formattedMessage = `[ERROR] ${formattedMessage}`;
        func = console.error;
        colour = [CONSOLE_COLOURS.BgRed, CONSOLE_COLOURS.FgBlack];
        break;
    }

    const timestamp = new Date().toISOString();
    if (colour.length > 0) {
      func(colour.join("") + "%s" + CONSOLE_COLOURS.Reset, `${timestamp} | ${formattedMessage}`);
    } else {
      func(`${timestamp} | ${formattedMessage}`);
    }
  }

  // Logging methods
  public debug(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void {
    if (this.mode === "production") return;
    this.formatLog(LOG_LEVELS.DEBUG, pluginName, trace, message, meta);
  }

  public info(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void {
    this.formatLog(LOG_LEVELS.INFO, pluginName, trace, message, meta);
  }

  public warn(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void {
    this.formatLog(LOG_LEVELS.WARN, pluginName, trace, message, meta);
  }

  public error(trace: DTrace, pluginName: string, message: string | BSBError<any>, meta?: LogMeta<any>): void {
    if (message instanceof BSBError) {
      if (message.raw !== null) {
        this.formatLog(LOG_LEVELS.ERROR, pluginName, message.raw.trace, message.raw.message, message.raw.meta);
      } else {
        this.formatLog(LOG_LEVELS.ERROR, pluginName, trace, message.message);
      }
    } else {
      this.formatLog(LOG_LEVELS.ERROR, pluginName, trace, message, meta);
    }
  }

  // Metrics methods - no-op for console plugin (could be implemented to log metrics)
  // Other observable plugins like observable-datadog would implement these properly

  // Lifecycle methods
  public dispose(): void {
    // No resources to cleanup for console logger
  }

  public async init(): Promise<void> {
    // No initialization needed for console logger
  }

  public async run(): Promise<void> {
    // No runtime setup needed for console logger
  }
}
