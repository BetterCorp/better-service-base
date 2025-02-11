/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.  
 * Copyright (C) 2024 BetterCorp (PTY) Ltd  
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

import {
  LogMeta,
  BSBLogging,
  BSBLoggingConstructor,
  LogFormatter,
  DTrace
} from "../../index";
import { CONSOLE_COLOURS, ConsoleColours } from "./colours";

export const LOG_LEVELS = {
  DEBUG: "Debug",
  INFO: "Info",
  WARN: "Warn",
  ERROR: "Error",
} as const;
export type LogLevels = (typeof LOG_LEVELS)[keyof typeof LOG_LEVELS];

export class Plugin
  extends BSBLogging {
  dispose?(): void;

  init?(): void;

  private _mockedConsole?: { (level: LogLevels, message: string): void };
  private _mockConsole: boolean = false;
  private logFormatter: LogFormatter = new LogFormatter();

  //private mode: DEBUG_MODE = "development";
  constructor(
    config: BSBLoggingConstructor,
    mockConsole?: { (level: LogLevels, message: string): void },
  ) {
    super(config);
    this._mockedConsole = mockConsole;
    if (this._mockedConsole !== undefined) {
      this._mockConsole = true;
    }
  }

  private logEvent<T extends string>(
    level: LogLevels,
    plugin: string,
    trace: DTrace,
    message: T,
    meta?: LogMeta<T>,
    additionalToConsole?: any,
  ) {
    let formattedMessage = this.logFormatter.formatLog<T>(trace, message, meta);
    formattedMessage = `[${ plugin.toUpperCase() }] ${ formattedMessage }`;
    let func: any = console.debug;
    let colour: Array<ConsoleColours> = [
      CONSOLE_COLOURS.BgBlack,
      CONSOLE_COLOURS.FgWhite,
    ];
    let colour2: Array<ConsoleColours> = [];
    if (level === LOG_LEVELS.DEBUG) {
      formattedMessage = `[DEBUG] ${ formattedMessage }`;
      //formattedMessage = `[DEBUG] ${message} ${JSON.stringify(meta)} == ${formattedMessage}`;
      colour = [
        CONSOLE_COLOURS.BgBlue,
        CONSOLE_COLOURS.FgWhite,
      ];
    }
    if (level === LOG_LEVELS.INFO) {
      formattedMessage = `[INFO] ${ formattedMessage }`;
      func = console.log;
      colour = [];
    }
    if (level === LOG_LEVELS.WARN) {
      formattedMessage = `[WARN] ${ formattedMessage }`;
      func = console.warn;
      colour = [
        CONSOLE_COLOURS.BgBlack,
        CONSOLE_COLOURS.FgRed,
      ];
    }
    if (level === LOG_LEVELS.ERROR) {
      formattedMessage = `[ERROR] ${ formattedMessage }`;
      func = console.error;
      colour = [
        CONSOLE_COLOURS.BgRed,
        CONSOLE_COLOURS.FgBlack,
      ];
      colour2 = [
        CONSOLE_COLOURS.BgBlack,
        CONSOLE_COLOURS.FgRed,
      ];
    }
    if (this._mockConsole) {
      return this._mockedConsole!(level, formattedMessage);
    }
    if (additionalToConsole) {
      formattedMessage += colour2.join("") + "\n" + additionalToConsole;
    }
    func(colour.join("") + "%s" + CONSOLE_COLOURS.Reset, formattedMessage);
  }

  public debug<T extends string>(
    plugin: string,
    trace: DTrace,
    message: T,
    meta: LogMeta<T>,
  ): void {
    if (this.mode === "production") {
      return;
    }
    this.logEvent<T>(LOG_LEVELS.DEBUG, plugin, trace, message as T, meta);
  }

  public info<T extends string>(
    plugin: string,
    trace: DTrace,
    message: T,
    meta: LogMeta<T>,
  ): void {
    this.logEvent<T>(LOG_LEVELS.INFO, plugin, trace, message as T, meta);
  }

  public warn<T extends string>(
    plugin: string,
    trace: DTrace,
    message: T,
    meta: LogMeta<T>,
  ): void {
    this.logEvent<T>(LOG_LEVELS.WARN, plugin, trace, message as T, meta);
  }

  public error<T extends string>(
    plugin: string,
    trace: DTrace,
    message: T,
    errorOrMeta?: Error | LogMeta<T>,
    meta?: LogMeta<T>,
  ): void {
    const hasErrorDefinition = meta !== undefined;
    const inclStack = errorOrMeta instanceof Error && errorOrMeta.stack;
    this.logEvent<T>(
      LOG_LEVELS.ERROR,
      plugin,
      trace,
      message as T,
      hasErrorDefinition ? meta : (
        errorOrMeta as LogMeta<T>
      ),
      inclStack ? "Stack trace for: " + errorOrMeta.stack : undefined
    );
  }
}
