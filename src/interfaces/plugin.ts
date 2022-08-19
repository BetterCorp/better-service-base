import { DynamicallyReferencedMethodBase } from '@bettercorp/tools/lib/Interfaces';
import { IPluginEvents } from "./events";

export interface IPlugin<
  onEvents extends DynamicallyReferencedMethodBase,
  emitEvents extends DynamicallyReferencedMethodBase,
  onReturnableEvents extends DynamicallyReferencedMethodBase,
  emitReturnableEvents extends DynamicallyReferencedMethodBase
> extends IPluginEvents<
    onEvents,
    emitEvents,
    onReturnableEvents,
    emitReturnableEvents
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
