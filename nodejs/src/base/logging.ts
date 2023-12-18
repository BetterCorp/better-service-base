/* eslint-disable @typescript-eslint/no-unused-vars */
import { BSBConfigDefinition, BaseWithConfig } from "./base";
import { DEBUG_MODE, LogMeta } from "../interfaces/logging";
import { BSB_ERROR_METHOD_NOT_IMPLEMENTED } from "./errorMessages";

export interface BSBLoggingConstructor {
  appId: string;
  mode: DEBUG_MODE;
  pluginName: string;
  cwd: string;
  pluginCwd: string;
  config: any;
}

export abstract class BSBLogging<
  ReferencedConfig extends BSBConfigDefinition
> extends BaseWithConfig<ReferencedConfig> {
  constructor(config: BSBLoggingConstructor) {
    super(
      config.appId,
      config.mode,
      config.pluginName,
      config.cwd,
      config.pluginCwd,
      config.config
    );
  }

  /**
   * This function is never used for events plugins.
   * @ignore @deprecated
   */
  public run() {}

  /**
   * Report stat
   * Reports a value(number) to the logging system
   *
   * @param plugin - The name of the plugin that wants to report a stat
   * @param key - The key of the stat to report
   * @param value - The value of the stat to report
   * @returns nothing
   *
   * @see BSB logging-default plugin for an example of how to use this function
   * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/logging-default | Default Logging Plugin}
   */
  public abstract reportStat(
    plugin: string,
    key: string,
    value: number
  ): Promise<void> | void;

  /**
   * Report text stat
   * Reports a value(string) to the logging system with additional information that is interpolateable
   * Like a log, but for stats
   *
   * @param plugin - The name of the plugin that wants to report a stat
   * @param message - The stat to report
   * @param meta - Additional information to report with the stat
   * @returns nothing
   *
   * @see BSB logging-default plugin for an example of how to use this function
   * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/logging-default | Default Logging Plugin}
   */
  public abstract reportTextStat<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>
  ): Promise<void> | void;

  /**
   * Debug
   * Logs an debug message
   *
   * @param plugin - The name of the plugin that wants to log
   * @param message - The message to log
   * @param meta - Additional information to log with the message
   * @returns nothing
   *
   * @see BSB logging-default plugin for an example of how to use this function
   * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/logging-default | Default Logging Plugin}
   */
  public abstract debug<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>
  ): Promise<void> | void;

  /**
   * Info
   * Logs an info message
   *
   * @param plugin - The name of the plugin that wants to log
   * @param message - The message to log
   * @param meta - Additional information to log with the message
   * @returns nothing
   *
   * @see BSB logging-default plugin for an example of how to use this function
   * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/logging-default | Default Logging Plugin}
   */
  public abstract info<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>
  ): Promise<void> | void;

  /**
   * Warn
   * Logs an warn message
   *
   * @param plugin - The name of the plugin that wants to log
   * @param message - The message to log
   * @param meta - Additional information to log with the message
   * @returns nothing
   *
   * @see BSB logging-default plugin for an example of how to use this function
   * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/logging-default | Default Logging Plugin}
   */
  public abstract warn<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>
  ): Promise<void> | void;

  /**
   * Error
   * Logs an error message
   *
   * @param plugin - The name of the plugin that wants to log
   * @param message - The message to log
   * @param meta - Additional information to log with the message
   * @returns nothing
   *
   * @see BSB logging-default plugin for an example of how to use this function
   * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/logging-default | Default Logging Plugin}
   */
  public abstract error<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>
  ): Promise<void> | void;
}

/**
 * DO NOT REFERENCE/USE THIS CLASS - IT IS AN INTERNALLY REFERENCED CLASS
 */
export class BSBLoggingRef extends BSBLogging<BSBConfigDefinition> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public reportStat(plugin: string, key: string, value: number): void {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBLoggingRef", "reportStat");
  }
  public reportTextStat<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T> | undefined
  ): void {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBLoggingRef", "reportTextStat");
  }
  public debug<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T> | undefined
  ): void {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBLoggingRef", "debug");
  }
  public info<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T> | undefined
  ): void {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBLoggingRef", "info");
  }
  public warn<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T> | undefined
  ): void {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBLoggingRef", "warn");
  }
  public error<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T> | undefined
  ): void {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBLoggingRef", "error");
  }
  dispose?(): void;
  init?(): void;
}
