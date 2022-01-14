import { IPluginConfig, IConfig } from './config';

export interface IPluginLogger {
  info(...data: any[]): Promise<void>;
  warn(...data: any[]): Promise<void>;
  error(...data: any[]): Promise<void>;
  fatal(...data: any[]): Promise<void>;
  debug(...data: any[]): Promise<void>;
}

export interface ILogger {
  init?(): Promise<void>;
  info(plugin: string, ...data: any[]): Promise<void>;
  warn(plugin: string, ...data: any[]): Promise<void>;
  error(plugin: string, ...data: any[]): Promise<void>;
  fatal(plugin: string, ...data: any[]): Promise<void>;
  debug(plugin: string, ...data: any[]): Promise<void>;
}

export class CLogger<PluginConfigType extends IPluginConfig = any> implements ILogger {
  pluginName: string;
  log: IPluginLogger;
  cwd: string;
  appConfig: IConfig;
  async getPluginConfig<T = PluginConfigType>(pluginName?: string): Promise<T> {
    return this.appConfig.getPluginConfig<T>(pluginName || this.pluginName);
  }

  constructor(pluginName: string, cwd: string, log: IPluginLogger, appConfig: IConfig) {
    this.pluginName = pluginName;
    this.cwd = cwd;
    this.log = log;
    this.appConfig = appConfig;
  }

  async info(plugin: string, ...data: any[]): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async warn(plugin: string, ...data: any[]): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async error(plugin: string, ...data: any[]): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async fatal(plugin: string, ...data: any[]): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async debug(plugin: string, ...data: any[]): Promise<void> {
    throw new Error("Method not implemented.");
  }
}