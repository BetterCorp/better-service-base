import { IServiceEvents } from "./events";

export interface IService<
  onEvents,
  onReturnableEvents
> extends IServiceEvents<
    onEvents,
    onReturnableEvents
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
  installerFile: string | null;
}
