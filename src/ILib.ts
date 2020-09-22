export enum GLOBAL_INNER_EVENTS {
  EVENT_WS_CONNECTION = 'ws-connection',
  EVENT_WS_FORCE_DC = 'ws-force-disconnect',
  EVENT_WS_DISCONNECTED = 'ws-close',
};

export interface ILOGGER {
  info (plugin: string, ...data: any[]): void;
  warn (plugin: string, ...data: any[]): void;
  error (plugin: string, ...data: any[]): void;
}

exports.GLOBAL_INNER_EVENTS;
export interface PluginFeature {
  log: ILOGGER,
  cwd: string,
  events: IEventEmitter;
  config: any;
  onEvent(event: string, endpoint: string | null, listener: (...args: any[]) => void, global: Boolean): void;
  emitEvent(event: string, ...args: any[]): void;
  emitEventAndReturn(event: string, endpointOrPluginName: string, timeoutSeconds?: number, ...args: any[]): Promise<any | void>;
}

export interface IPlugin {
  name: string;
  log: ILOGGER | undefined;
  init(features: PluginFeature): void;
}

export interface IEventEmitter {
  emit(name: string, object: any): void;
}
