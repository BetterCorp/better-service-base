import { Tools } from '@bettercorp/tools/lib/Tools';
import { Readable } from 'stream';
import { IPluginConfig, IConfig } from './config';
import { IPluginEvents, IPluginClientEvents } from './events';
import { IPluginLogger } from './logger';

export interface IPlugin<DefaultDataType = any, DefaultReturnType = void> extends IPluginEvents<DefaultDataType, DefaultReturnType> {
  initIndex?: number;
  init?(): Promise<void>;
  loadedIndex?: number;
  loaded?(): Promise<void>;

  initForPlugins?<ArgsDataType = DefaultDataType, ReturnDataType = DefaultReturnType>(pluginName: string, initType: string | null, ...args: Array<ArgsDataType>): Promise<ReturnDataType>;
}

export class CPlugin<PluginConfigType extends IPluginConfig = any, DefaultDataType = any, DefaultReturnType = void> implements IPlugin {
  initIndex?: number;
  loadedIndex?: number;

  pluginName: string;
  log: IPluginLogger;
  cwd: string;
  appConfig: IConfig;
  async getPluginConfig<T = PluginConfigType>(pluginName?: string): Promise<T> {
    return this.appConfig.getPluginConfig<T>(pluginName || this.pluginName);
  }

  constructor(pluginName: string, cwd: string, log: IPluginLogger, appConfig: IConfig) {
    if (Tools.isNullOrUndefined(this.initIndex))
      this.initIndex = -1;
    if (Tools.isNullOrUndefined(this.loadedIndex))
      this.loadedIndex = 1;
    this.pluginName = pluginName;
    this.cwd = cwd;
    this.log = log;
    this.appConfig = appConfig;
  }
  async onEvent<ArgsDataType = DefaultDataType>(pluginName: string | null, event: string, listener: (data: ArgsDataType) => void): Promise<void> {
    throw new Error("BSB INIT ERROR");
  }
  async onReturnableEvent<ArgsDataType = DefaultDataType, ReturnDataType = DefaultDataType>(pluginName: string | null, event: string, listener: (data?: ArgsDataType) => Promise<ReturnDataType>): Promise<void> {
    throw new Error("BSB INIT ERROR");
  }
  async emitEvent<ArgsDataType = DefaultDataType>(pluginName: string | null, event: string, data?: ArgsDataType): Promise<void> {
    throw new Error("BSB INIT ERROR");
  }
  async emitEventAndReturn<ArgsDataType = DefaultDataType, ReturnDataType = DefaultReturnType>(pluginName: string | null, event: string, data?: ArgsDataType, timeoutSeconds?: number): Promise<ReturnDataType> {
    throw new Error("BSB INIT ERROR");
  }
  async receiveStream(listener: (error: Error | null, stream: Readable) => void, timeoutSeconds?: number): Promise<string> {
    throw new Error("BSB INIT ERROR");
  }
  async sendStream(streamId: string, stream: Readable): Promise<void> {
    throw new Error("BSB INIT ERROR");
  }
}

export class CPluginClient<T> implements IPluginClientEvents<any, any> {
  public readonly _pluginName: string | undefined;
  public async pluginName(): Promise<string> {
    return this.refPlugin.appConfig.getMappedPluginName(this._pluginName!);
  }
  public refPlugin: CPlugin;

  constructor(self: IPlugin) {
    this.refPlugin = self as CPlugin;
  }

  async getPluginConfig(): Promise<T> {
    return this.refPlugin.getPluginConfig<T>(await this.pluginName());
  }
  async initForPlugins<ArgsDataType = any, ReturnDataType = void>(initType: string, ...args: Array<ArgsDataType>): Promise<ReturnDataType> {
    return (this.refPlugin as IPlugin).initForPlugins!<ArgsDataType, ReturnDataType>(this._pluginName!, initType, ...args);
  }

  async onEvent<ArgsDataType = any>(event: string, listener: (data: ArgsDataType) => void): Promise<void> {
    this.refPlugin.onEvent<ArgsDataType>(this._pluginName!, event, listener);
  }
  async onReturnableEvent<ArgsDataType = any, ReturnDataType = any>(event: string, listener: (data?: ArgsDataType) => Promise<ReturnDataType>): Promise<void> {
    await this.refPlugin.onReturnableEvent<ArgsDataType>(this._pluginName!, event, listener);
  }
  async emitEvent<T = any>(event: string, data?: T): Promise<void> {
    this.refPlugin.emitEvent<T>(this._pluginName!, event, data);
  }
  async emitEventAndReturn<ArgsDataType = any, ReturnDataType = void>(event: string, data?: ArgsDataType, timeoutSeconds?: number): Promise<ReturnDataType> {
    return this.refPlugin.emitEventAndReturn<ArgsDataType, ReturnDataType>(this._pluginName!, event, data, timeoutSeconds);
  }
  async receiveStream(listener: (error: Error | null, stream: Readable) => Promise<void>, timeoutSeconds?: number): Promise<string> {
    return this.refPlugin.receiveStream(listener, timeoutSeconds);
  }
  async sendStream(streamId: string, stream: Readable): Promise<void> {
    return this.refPlugin.sendStream(streamId, stream);
  }
}

export enum IPluginDefinition {
  config = "config",
  events = "events",
  logging = "logging",
  normal = "normal"
}

export interface IReadyPlugin {
  pluginDefinition: IPluginDefinition;
  name: string;
  version: string;
  pluginFile: string;
  installerFile: string | null;
}