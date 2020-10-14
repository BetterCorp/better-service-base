import { IDictionary } from '@bettercorp/tools/lib/Interfaces';

export interface ILogger {
  init (features: PluginFeature): Promise<void>;
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
  getPluginConfig<T = ServiceConfigPlugins> (): T;
  onEvent<T = any> (pluginName: string | null, event: string, listener: (data: IEmitter<T>) => void): void;
  emitEvent<T = any> (pluginName: string | null, event: string, data?: T): void;
  emitEventAndReturn<T1 = any, T2 = void> (pluginName: string | null, event: string, data?: T1): Promise<T2>;
  initForPlugins?<T1 = any, T2 = void>(pluginName: string, initType: string | null, args: T1): Promise<T2>;
}

export interface IEvents {
  init (features: PluginFeature): Promise<void>;
  onEvent<T = any> (plugin: string, pluginName: string | null, event: string, listener: (data: IEmitter<T>) => void): void;
  emitEvent<T = any> (plugin: string, pluginName: string | null, event: string, data?: T): void;
  emitEventAndReturn<T1 = any, T2 = void> (plugin: string, pluginName: string | null, event: string, data?: T1): Promise<T2>;
}

export interface IPlugin {
  log?: IPluginLogger;
  initIndex?: number;
  init (features: PluginFeature): Promise<void>;
  loadedIndex?: number;
  loaded? (features: PluginFeature): Promise<void>;
  initForPlugins?<T1 = any, T2 = void>(initType: string | null, args: T1): Promise<T2>;
}

export interface IEventEmitter {
  emit (name: string, object: any): void;
}

export interface IEmitter<T = any> {
  resultKey: string;
  resultNames: {
    plugin: string,
    success: string,
    error: string;
  };
  data: T;
}

export interface ServiceConfig {
  identity: string;
  debug: boolean;
  plugins: ServiceConfigPlugins;
}

export interface ServiceConfigPlugins extends IDictionary {

}