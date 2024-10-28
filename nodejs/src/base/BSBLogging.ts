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

/* eslint-disable @typescript-eslint/no-unused-vars */
import { LogMeta } from "../interfaces";
import { BaseWithConfig, BaseWithConfigConfig } from "./base";
import { BSB_ERROR_METHOD_NOT_IMPLEMENTED } from "./errorMessages";
import { BSBReferencePluginConfigDefinition, BSBReferencePluginConfigType } from "./pluginConfig";
import { DTrace } from "../interfaces";

export interface BSBLoggingConstructor<
  ReferencedConfig extends BSBReferencePluginConfigType = any
>
  extends BaseWithConfigConfig<
    ReferencedConfig extends null
    ? null
    : BSBReferencePluginConfigDefinition<ReferencedConfig>
  > {
}

/**
 * @group Logging
 * @category Plugin Development
 */
export abstract class BSBLogging<
  ReferencedConfig extends BSBReferencePluginConfigType = any
>
  extends BaseWithConfig<
    ReferencedConfig extends null
    ? null
    : BSBReferencePluginConfigDefinition<ReferencedConfig>
  > {
  constructor(config: BSBLoggingConstructor<ReferencedConfig>) {
    super(config);
  }

  /**
   * This function is never used for events plugins.
   * @ignore @deprecated
   */
  public run() {
  }

  /**
   * Debug
   * Logs an debug message
   *
   * @param plugin - The name of the plugin that wants to log
   * @param traceId - The trace ID to associate with the log
   * @param spanId - The span ID to associate with the log
   * @param message - The message to log
   * @param meta - Additional information to log with the message
   * @returns nothing
   *
   * @see BSB logging-default plugin for an example of how to use this function
   * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/logging-default | Default Logging Plugin}
   */
  public abstract debug<T extends string>(
    plugin: string,
    trace: DTrace,
    message: T,
    meta?: LogMeta<T>,
  ): Promise<void> | void;

  /**
   * Info
   * Logs an info message
   *
   * @param plugin - The name of the plugin that wants to log
   * @param trace - The trace to associate with the log
   * @param message - The message to log
   * @param meta - Additional information to log with the message
   * @returns nothing
   *
   * @see BSB logging-default plugin for an example of how to use this function
   * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/logging-default | Default Logging Plugin}
   */
  public abstract info<T extends string>(
    plugin: string,
    trace: DTrace,
    message: T,
    meta?: LogMeta<T>,
  ): Promise<void> | void;

  /**
   * Warn
   * Logs an warn message
   *
   * @param plugin - The name of the plugin that wants to log
   * @param trace - The trace to associate with the log
   * @param message - The message to log
   * @param meta - Additional information to log with the message
   * @returns nothing
   *
   * @see BSB logging-default plugin for an example of how to use this function
   * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/logging-default | Default Logging Plugin}
   */
  public abstract warn<T extends string>(
    plugin: string,
    trace: DTrace,
    message: T,
    meta?: LogMeta<T>,
  ): Promise<void> | void;

  /**
   * Error
   * Logs an error message
   *
   * @param plugin - The name of the plugin that wants to log
   * @param trace - The trace to associate with the log
   * @param message - The message to log
   * @param meta - Additional information to log with the message
   * @returns nothing
   *
   * @see BSB logging-default plugin for an example of how to use this function
   * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/logging-default | Default Logging Plugin}
   */
  public abstract error<T extends string>(
    plugin: string,
    trace: DTrace,
    messageOrError: T,
    errorOrMeta?: Error | LogMeta<T>,
    meta?: LogMeta<T>,
  ): Promise<void> | void;
}

/**
 * @hidden
 * DO NOT REFERENCE/USE THIS CLASS - IT IS AN INTERNALLY REFERENCED CLASS
 */
export class BSBLoggingRef
  extends BSBLogging<null> {
  public debug<T extends string>(
    plugin: string,
    trace: DTrace,
    message: T,
    meta?: LogMeta<T> | undefined,
  ): void {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBLoggingRef", "debug");
  }

  public info<T extends string>(
    plugin: string,
    trace: DTrace,
    message: T,
    meta?: LogMeta<T> | undefined,
  ): void {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBLoggingRef", "info");
  }

  public warn<T extends string>(
    plugin: string,
    trace: DTrace,
    message: T,
    meta?: LogMeta<T> | undefined,
  ): void {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBLoggingRef", "warn");
  }

  public error<T extends string>(
    plugin: string,
    trace: DTrace,
    messageOrError: T,
    errorOrMeta?: Error | LogMeta<T>,
    meta?: LogMeta<T>,
  ): void {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBLoggingRef", "error");
  }

  dispose?(): void;

  init?(): void;
}
