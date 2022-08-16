import { IPluginConfig, IConfig } from "./config";
import { IDictionary } from "@bettercorp/tools/lib/Interfaces";

export interface LogMeta extends IDictionary<any> {}

export interface IPluginLogger {
  info(message: string, meta?: LogMeta, hasPIData?: boolean): Promise<void>;
  warn(message: string, meta?: LogMeta, hasPIData?: boolean): Promise<void>;
  error(message: string, meta?: LogMeta, hasPIData?: boolean): Promise<void>;
  fatal(message: string, meta?: LogMeta, hasPIData?: boolean): Promise<void>;
  debug(message: string, meta?: LogMeta, hasPIData?: boolean): Promise<void>;
}

export interface ILogger {
  init?(): Promise<void>;
  info(
    plugin: string,
    message: string,
    meta?: LogMeta,
    hasPIData?: boolean
  ): Promise<void>;
  warn(
    plugin: string,
    message: string,
    meta?: LogMeta,
    hasPIData?: boolean
  ): Promise<void>;
  error(
    plugin: string,
    message: string,
    meta?: LogMeta,
    hasPIData?: boolean
  ): Promise<void>;
  fatal(plugin: string, message: string, meta?: LogMeta): Promise<void>;
  debug(
    plugin: string,
    message: string,
    meta?: LogMeta,
    hasPIData?: boolean
  ): Promise<void>;
}

export class CLogger<PluginConfigType extends IPluginConfig = any>
  implements ILogger
{
  pluginName: string;
  log: IPluginLogger;
  cwd: string;
  appConfig: IConfig;
  async getPluginConfig<ConfigType extends IPluginConfig = PluginConfigType>(
    pluginName?: string
  ): Promise<ConfigType> {
    return this.appConfig.getPluginConfig<ConfigType>(
      pluginName || this.pluginName
    );
  }

  constructor(
    pluginName: string,
    cwd: string,
    log: IPluginLogger,
    appConfig: IConfig
  ) {
    this.pluginName = pluginName;
    this.cwd = cwd;
    this.log = log;
    this.appConfig = appConfig;
  }

  async info(
    plugin: string,
    message: string,
    meta?: LogMeta,
    hasPIData?: boolean
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async warn(
    plugin: string,
    message: string,
    meta?: LogMeta,
    hasPIData?: boolean
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async error(
    plugin: string,
    message: string,
    meta?: LogMeta,
    hasPIData?: boolean
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async fatal(
    plugin: string,
    message: string,
    meta?: LogMeta,
    hasPIData?: boolean
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async debug(
    plugin: string,
    message: string,
    meta?: LogMeta,
    hasPIData?: boolean
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
