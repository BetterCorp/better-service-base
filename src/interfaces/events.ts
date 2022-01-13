import { Readable } from 'stream';
import { IConfig, IPluginConfig } from './config';
import { IPluginLogger } from './logger';

export interface IEvents<DefaultDataType = any, DefaultReturnType = void> {
  init?(): Promise<void>;
  log?: IPluginLogger;
  onEvent<ArgsDataType = DefaultDataType>(callerPluginName: string, pluginName: string, event: string, listener: { (data: ArgsDataType): Promise<void>; }): Promise<void>;
  onReturnableEvent<ArgsDataType = DefaultDataType, ReturnDataType = DefaultDataType>(callerPluginName: string, pluginName: string, event: string, listener: (data?: ArgsDataType) => Promise<ReturnDataType>): Promise<void>;
  emitEvent<ArgsDataType = DefaultDataType>(callerPluginName: string, pluginName: string, event: string, data?: ArgsDataType): Promise<void>;
  emitEventAndReturn<ArgsDataType = DefaultDataType, ReturnDataType = DefaultReturnType>(callerPluginName: string, pluginName: string, event: string, data?: ArgsDataType, timeoutSeconds?: number): Promise<ReturnDataType>;
  receiveStream(callerPluginName: string, listener: { (error: Error | null, stream: Readable): Promise<void>; }, timeoutSeconds?: number): Promise<string>;
  sendStream(callerPluginName: string, streamId: string, stream: Readable): Promise<void>;
}

export interface IPluginEvents<DefaultDataType = any, DefaultReturnType = void> {
  onEvent<ArgsDataType = DefaultDataType>(pluginName: string | null, event: string, listener: { (data: ArgsDataType): Promise<void>; }): Promise<void>;
  onReturnableEvent<ArgsDataType = DefaultDataType, ReturnDataType = DefaultDataType>(pluginName: string | null, event: string, listener: (data?: ArgsDataType) => Promise<ReturnDataType>): Promise<void>;
  emitEvent<ArgsDataType = DefaultDataType>(pluginName: string | null, event: string, data?: ArgsDataType): Promise<void>;
  emitEventAndReturn<ArgsDataType = DefaultDataType, ReturnDataType = DefaultReturnType>(pluginName: string | null, event: string, data?: ArgsDataType, timeoutSeconds?: number): Promise<ReturnDataType>;
  receiveStream(listener: { (error: Error | null, stream: Readable): Promise<void>; }, timeoutSeconds?: number): Promise<string>;
  sendStream(streamId: string, stream: Readable): Promise<void>;
}

export interface IPluginClientEvents<DefaultDataType = any, DefaultReturnType = void> {
  onEvent<ArgsDataType = DefaultDataType>(event: string, listener: { (data: ArgsDataType): Promise<void>; }): Promise<void>;
  onReturnableEvent<ArgsDataType = DefaultDataType, ReturnDataType = DefaultDataType>(event: string, listener: (data?: ArgsDataType) => Promise<ReturnDataType>): Promise<void>;
  emitEvent<ArgsDataType = DefaultDataType>(event: string, data?: ArgsDataType): Promise<void>;
  emitEventAndReturn<ArgsDataType = DefaultDataType, ReturnDataType = DefaultReturnType>(event: string, data?: ArgsDataType, timeoutSeconds?: number): Promise<ReturnDataType>;
  receiveStream(listener: { (error: Error | null, stream: Readable): Promise<void>; }, timeoutSeconds?: number): Promise<string>;
  sendStream(streamId: string, stream: Readable): Promise<void>;
}

export class CEvents<PluginConfigType extends IPluginConfig = any, DefaultDataType = any, DefaultReturnType = void> implements IEvents {
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

  async onEvent<ArgsDataType = DefaultDataType>(callerPluginName: string, pluginName: string, event: string, listener: { (data: ArgsDataType): Promise<void>; }): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async onReturnableEvent<ArgsDataType = DefaultDataType, ReturnDataType = DefaultDataType>(callerPluginName: string, pluginName: string, event: string, listener: (data?: ArgsDataType) => Promise<ReturnDataType>): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async emitEvent<ArgsDataType = DefaultDataType>(callerPluginName: string, pluginName: string, event: string, data?: ArgsDataType): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async emitEventAndReturn<ArgsDataType = DefaultDataType, ReturnDataType = DefaultReturnType>(callerPluginName: string, pluginName: string, event: string, data?: ArgsDataType, timeoutSeconds?: number): Promise<ReturnDataType> {
    throw new Error("Method not implemented.");
  }
  async receiveStream(callerPluginName: string, listener: (error: Error | null, stream: Readable) => Promise<void>, timeoutSeconds?: number): Promise<string> {
    throw new Error('Method not implemented.');
  }
  async sendStream(callerPluginName: string, streamId: string, stream: Readable): Promise<void> {
    throw new Error('Method not implemented.');
  }
}