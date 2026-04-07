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

import { BSBError } from "../base/index.js";
import { ParamsFromString } from "./tools.js";
import { DTrace } from "./metrics.js";

/**
 * The debug mode of the app
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#module-interfaces_logging | API: interfaces/logging}
 * @example "production" - production mode with no debug
 * @example "production-debug" - production mode with debug
 * @example "development" - development mode with debug
 */
export type DEBUG_MODE = "production" | "production-debug" | "development";

export type SafeLogData =
  | string
  | number
  | boolean
  | Array<string | number | boolean>
  | Object;
export type UnsafeLogData = {
  value: string | number | boolean | Array<string | number | boolean> | Object; // Unsafe and unsanitized data
  safeValue: SafeLogData; // Safe and sanitized data
}; // Data can contain sensitive information

export type LogMeta<T extends string> = Record<
  ParamsFromString<T>,
  UnsafeLogData | SafeLogData
>;

/**
 * If you are going to make an object or something, use LogMeta instead.
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#module-interfaces_logging | API: interfaces/logging}
 */
export type SmartLogMeta<T extends string> = ParamsFromString<T> extends never
  ? [undefined?]
  : [meta: Record<ParamsFromString<T>, UnsafeLogData | SafeLogData>];

/**
 * @group Logging
 * @category Plugin Development Tools
 * @see {@link https://bsbcode.dev/languages/nodejs/types/interfaces/IPluginLogging.html | API: IPluginLogging}
 */
export interface IPluginLogging {
  /**
   * Log an informational message with meta data.
   * @param trace - The trace object.
   * @param message - The message to log.
   * @param meta - The meta data to log.
   * @see {@link https://bsbcode.dev/languages/nodejs/types/interfaces/IPluginLogging.html#info | API: IPluginLogging#info}
   */
  info<T extends string>(trace: DTrace, message: T, ...meta: SmartLogMeta<T>): void;

  /**
   * Log a warning message with meta data.
   * @param trace - The trace object.
   * @param message - The message to log.
   * @param meta - The meta data to log.
   * @see {@link https://bsbcode.dev/languages/nodejs/types/interfaces/IPluginLogging.html#warn | API: IPluginLogging#warn}
   */
  warn<T extends string>(trace: DTrace, message: T, ...meta: SmartLogMeta<T>): void;

  /**
   * Log a debug message with meta data.
   * @param trace - The trace object.
   * @param message - The message to log.
   * @param meta - The meta data to log.
   * @see {@link https://bsbcode.dev/languages/nodejs/types/interfaces/IPluginLogging.html#debug | API: IPluginLogging#debug}
   */
  debug<T extends string>(trace: DTrace, message: T, ...meta: SmartLogMeta<T>): void;

  /**
   * Log an error message with meta data.
   * @param trace - The trace object.
   * @param message - The message to log.
   * @param meta - The meta data to log.
   * @see {@link https://bsbcode.dev/languages/nodejs/types/interfaces/IPluginLogging.html#error | API: IPluginLogging#error}
   */
  error<T extends string>(
    trace: DTrace,
    message: T,
    ...meta: SmartLogMeta<T>
  ): void;

  /**
   * Log an error message with meta data.
   * @param error - The error to log.
   * @see {@link https://bsbcode.dev/languages/nodejs/types/interfaces/IPluginLogging.html#error | API: IPluginLogging#error}
   */
  error<T extends string>(error: BSBError<T>): void;
}

/**
 * @hidden
 */
export const LoggingEventTypesBase = {
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
} as const;
/**
 * @hidden
 */
export type LoggingEventTypes =
  (typeof LoggingEventTypesBase)[keyof typeof LoggingEventTypesBase];
