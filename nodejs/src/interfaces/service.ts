import { IServiceEvents } from "./events";

export interface IService<
  onEvents,
  emitEvents,
  onReturnableEvents,
  emitReturnableEvents,
  onBroadcast,
  emitBroadcast
> extends IServiceEvents<
    onEvents,
    emitEvents,
    onReturnableEvents,
    emitReturnableEvents,
    onBroadcast,
    emitBroadcast
  > {
  initIndex?: number;
  init?(): Promise<void>;
  loadedIndex?: number;
  loaded?(): Promise<void>;
}

export enum IPluginDefinition {
  config = "config",
  events = "events",
  logging = "logging",
  service = "service",
}

export interface IReadyPlugin {
  pluginDefinition: IPluginDefinition;
  name: string;
  mappedName: string;
  version: string;
  pluginFile: string;
  pluginDir: string;
  installerFile: string | null;
}
