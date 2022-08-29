import { IPluginEvents } from "./events";

export interface IPlugin<
  onEvents,
  onReturnableEvents
> extends IPluginEvents<
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
  normal = "normal",
}

export interface IReadyPlugin {
  pluginDefinition: IPluginDefinition;
  name: string;
  version: string;
  pluginFile: string;
  installerFile: string | null;
}
