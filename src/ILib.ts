import { IDictionary } from '@bettercorp/tools/lib/Interfaces';

export interface ILogger {
  info (plugin: string, ...data: any[]): void;
  warn (plugin: string, ...data: any[]): void;
  error (plugin: string, ...data: any[]): void;
  debug (plugin: string, ...data: any[]): void;
}

export interface IPluginLogger {
  info (...data: any[]): void;
  warn (...data: any[]): void;
  error (...data: any[]): void;
  debug (...data: any[]): void;
}

export interface PluginFeature {
  pluginName: string;
  log: IPluginLogger;
  cwd: string;
  config: ServiceConfig;
  getPluginConfig<T = ServiceConfigPlugins>(): T;
  onEvent<T = any>(event: string, global: Boolean, listener: (data: IEmitter<T>) => void): void;
  emitEvent<T = any>(event: string, global: boolean, data?: T): void;
  emitEventAndReturn<T1 = any, T2 = any>(event: string, endpointOrPluginName: string, data?: T1): Promise<T2 | void>;
}

export interface IEvents {
  onEvent<T = any>(plugin: string, event: string, global: Boolean, listener: (data: IEmitter<T>) => void): void;
  emitEvent<T = any>(plugin: string, event: string, global: boolean, data?: T): void;
  emitEventAndReturn<T1 = any, T2 = any>(plugin: string, event: string, endpointOrPluginName: string, data?: T1): Promise<T2 | void>;
}

export interface IPlugin {
  name: string;
  log: IPluginLogger | undefined;
  init(features: PluginFeature): void;
}

export interface IEventEmitter {
  emit(name: string, object: any): void;
}

export interface IEmitter<T = any> {
  resultKey: string,
  resultNames: {
    success: string,
    error: string
  },
  data: T
}

export interface ServiceConfig {
  identity: string;
  debug: boolean;
  plugins: ServiceConfigPlugins;
}

export interface ServiceConfigPlugins extends IDictionary {

}