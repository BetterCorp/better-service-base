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

export const PluginDefinitions = {
  config: "config",
  events: "events",
  logging: "logging",
  service: "service",
} as const;
export type PluginDefinition =
  (typeof PluginDefinitions)[keyof typeof PluginDefinitions];

export interface IReadyPlugin {
  pluginDefinition: PluginDefinition;
  name: string;
  mappedName: string;
  version: string;
  pluginFile: string;
  pluginDir: string;
  installerFile: string | null;
}
