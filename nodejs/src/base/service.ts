/* eslint-disable @typescript-eslint/no-unused-vars */
import { SBEvents, SBMetrics } from "../serviceBase";
import {
  BaseWithLoggingAndConfig,
  BaseWithLoggingAndConfigConfig,
  BSBPluginEvents,
  BSBPluginEventsRef,
  PluginEvents,
  BSBServiceClient,
  BSBReferencePluginConfigType,
  BSBReferencePluginConfigDefinition,
  PluginMetrics,
} from "./index";

export interface BSBServiceConstructor<
  ReferencedConfig extends BSBReferencePluginConfigType = any
> extends BaseWithLoggingAndConfigConfig<
    ReferencedConfig extends null
      ? null
      : BSBReferencePluginConfigDefinition<ReferencedConfig>
  > {
  sbEvents: SBEvents;
  sbMetrics: SBMetrics;
}

export abstract class BSBService<
  ReferencedConfig extends BSBReferencePluginConfigType = any,
  Events extends BSBPluginEvents = BSBPluginEventsRef
> extends BaseWithLoggingAndConfig<
  ReferencedConfig extends null
    ? null
    : BSBReferencePluginConfigDefinition<ReferencedConfig>
> {
  public abstract readonly initBeforePlugins?: Array<string>;
  public abstract readonly initAfterPlugins?: Array<string>;
  public abstract readonly runBeforePlugins?: Array<string>;
  public abstract readonly runAfterPlugins?: Array<string>;
  public readonly _virtual_internal_events: {
    onEvents: Events["onEvents"];
    emitEvents: Events["emitEvents"];
    onReturnableEvents: Events["onReturnableEvents"];
    emitReturnableEvents: Events["emitReturnableEvents"];
    onBroadcast: Events["onBroadcast"];
    emitBroadcast: Events["emitBroadcast"];
  } = {} as any;
  public readonly events: PluginEvents<
    Events["onEvents"],
    Events["emitEvents"],
    Events["onReturnableEvents"],
    Events["emitReturnableEvents"],
    Events["onBroadcast"],
    Events["emitBroadcast"]
  >;
  public _clients: Array<BSBServiceClient> = [];
  public readonly metrics: PluginMetrics;

  constructor(config: BSBServiceConstructor<ReferencedConfig>) {
    super(config);
    this.events = new PluginEvents(config.mode, config.sbEvents, this);
    this.metrics = new PluginMetrics(config.appId, config.pluginName, config.sbMetrics);
  }
}

/**
 * @hidden
 * DO NOT REFERENCE/USE THIS CLASS - IT IS AN INTERNALLY REFERENCED CLASS
 */
export class BSBServiceRef extends BSBService<null> {
  public initBeforePlugins?: string[] | undefined;
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;
  dispose?(): void;
  init?(): void | Promise<void>;
  run?(): void | Promise<void>;
  constructor(config: BSBServiceConstructor<null>) {
    super(config);
  }
}
