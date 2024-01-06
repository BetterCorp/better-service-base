import { LoggerBase, IPluginLogger, LogMeta } from "@bettercorp/service-base";
import { PluginConfig } from './sec.config';

export class Logger extends LoggerBase<PluginConfig> {
  constructor(
    pluginName: string,
    cwd: string,
    pluginCwd: string,
    defaultLogger: IPluginLogger
  ) {
    super(pluginName, cwd, pluginCwd, defaultLogger);
  }

  public async reportStat(
    plugin: string,
    key: string,
    value: number
  ): Promise<void> {
    /**
     * TODO: implement
     * 
     * This function allows for a plugin to report a stat to your logging platform
     */
  }

  public async reportTextStat<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    /**
     * TODO: implement
     * 
     * This function allows for a plugin to report a stat in text to your logging platform
     */
  }

  public async debug<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    if (!this.runningDebug) return;
    /**
     * TODO: implement
     * 
     * This function allows for a plugin to report a debug message to your logging platform
     */
  }

  public async info<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    /** 
     * TODO: implement
     * 
     * This function allows for a plugin to report an info message to your logging platform
     */
  }

  public async warn<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    /**
     * TODO: implement
     * 
     * This function allows for a plugin to report a warning message to your logging platform
     */
  }

  public async error<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void>;
  public async error(plugin: string, error: Error): Promise<void>;
  public async error<T extends string>(
    plugin: string,
    messageOrError: T | Error,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    /**
     * TODO: implement
     * 
     * This function allows for a plugin to report an error message to your logging platform
     * log.fatal() calls this method first before terminating the process
     */
  }
}
