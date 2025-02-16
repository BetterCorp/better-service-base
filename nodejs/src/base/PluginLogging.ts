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

import { Tools } from '../base/tools';
import { createFakeDTrace, DEBUG_MODE, DTrace, IPluginLogging, SmartLogMeta } from "../interfaces";
import { SBLogging } from "../serviceBase";
import { BSBError } from "./errorMessages";

/**
 * @group Logging
 * @category Plugin Development Tools
 */
export class PluginLogging
  implements IPluginLogging {
  private logging: SBLogging;
  private pluginName: string;
  private canDebug = false;

  constructor(mode: DEBUG_MODE, plugin: string, logging: SBLogging) {
    this.logging = logging;
    this.pluginName = plugin;
    if (mode !== "production") {
      this.canDebug = true;
    }
  }

  /**
   * Logs a debug message
   *
   * @param trace - The trace to associate with the log
   * @param message - The message to log
   * @param meta - Additional information to log with the message
   * @returns nothing
   *
   * @example
   * ```ts
   * this.log.debug(trace, "This is a debug log");
   * this.log.debug(trace, "This is a debug {key}", {"key": "log"});
   * ```
   */
  public debug<T extends string>(trace: DTrace, message: T, ...meta: SmartLogMeta<T>): void {
    if (this.canDebug) {
      this.logging.logBus.emit("debug", this.pluginName, trace, message, ...meta);
    }
  }

  /**
   * Logs an info message
   *
   * @param trace - The trace to associate with the log
   * @param message - The message to log
   * @param meta - Additional information to log with the message
   * @returns nothing
   *
   * @example
   * ```ts
   * this.log.info(trace, "This is an info log");
   * this.log.info(trace, "This is an info {key}", {"key": "log"});
   * ```
   */
  public info<T extends string>(trace: DTrace, message: T, ...meta: SmartLogMeta<T>): void {
    this.logging.logBus.emit("info", this.pluginName, trace, message, ...meta);
  }

  /**
   * Logs a warn message
   *
   * @param trace - The trace to associate with the log
   * @param message - The message to log
   * @param meta - Additional information to log with the message
   * @returns nothing
   *
   * @example
   * ```ts
   * this.log.warn(trace, "This is a warn log");
   * this.log.warn(trace, "This is a warn {key}", {"key": "log"});
   * ```
   */
  public warn<T extends string>(trace: DTrace, message: T, ...meta: SmartLogMeta<T>): void {
    this.logging.logBus.emit("warn", this.pluginName, trace, message, ...meta);
  }

  /**
   * Logs an error message
   *
   * @param trace - The trace to associate with the log
   * @param message - The message to log
   * @param meta - Additional information to log with the message
   * @returns nothing
   *
   * @example
   * ```ts
   * this.log.error(trace, "This is an error log");
   * this.log.error(trace, "This is an error {key}", {"key": "log"});
   * ```
   * ```ts
   * this.log.error(new BSBError(trace, "error-key", "This is an error log"));
   * this.log.error(new BSBError(trace, "error-key", "This is an error {key}", {"key": "log"}));
   * ```
   */
  public error<T extends string>(
    trace: DTrace,
    message: T,
    ...meta: SmartLogMeta<T>
  ): void;
  public error<T extends string>(error: BSBError<T>): void;
  public error<T extends DTrace | BSBError<string>, M extends string>(
    traceOrError: T,
    message?: M,
    ...meta: M extends string ? SmartLogMeta<M> : [undefined?]
  ): void {
    if (traceOrError instanceof BSBError) {
      if (traceOrError.raw !== null) {
        this.logging.logBus.emit(
          "error",
          this.pluginName,
          traceOrError.raw.trace,
          traceOrError.raw.message,
          traceOrError.raw.meta,
        );
        return;
      }
      this.error(createFakeDTrace('base/PluginLogging', 'error'), traceOrError.message + ' - error ');
      return;
    }
    if (!Tools.isObject(traceOrError) || !Tools.isString(traceOrError.t) || !Tools.isString(traceOrError.s)) {
      this.error(createFakeDTrace('base/PluginLogging', 'errorType'), JSON.stringify(traceOrError));
      return;
    }
    this.logging.logBus.emit(
      "error",
      this.pluginName,
      traceOrError,
      message,
      ...meta,
    );
  }
}
