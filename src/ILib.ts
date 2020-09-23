export enum GLOBAL_INNER_EVENTS {
  EVENT_WS_CONNECTION = 'ws-connection',
  EVENT_WS_FORCE_DC = 'ws-force-disconnect',
  EVENT_WS_DISCONNECTED = 'ws-close',
};

export interface ILOGGER {
  info (plugin: string, ...data: any[]): void;
  warn (plugin: string, ...data: any[]): void;
  error (plugin: string, ...data: any[]): void;
  debug (plugin: string, ...data: any[]): void;
}

exports.GLOBAL_INNER_EVENTS;
export interface PluginFeature {
  pluginName: string;
  log: ILOGGER;
  cwd: string;
  events: IEventEmitter;
  config: ServiceConfig;
  onEvent<T = any>(event: string, global: Boolean, listener: (data: IEmitter<T>) => void): void;
  emitEvent<T = any>(event: string, global: boolean, data?: T): void;
  emitEventAndReturn<T1 = any, T2 = any>(event: string, endpointOrPluginName: string, data?: T1): Promise<T2 | void>;
}

export interface IPlugin {
  name: string;
  log: ILOGGER | undefined;
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

export interface ServiceConfigPlugins {

}