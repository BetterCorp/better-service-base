/* eslint-disable @typescript-eslint/no-unused-vars */
import { ServiceEventsBase } from "../interfaces";
import { SBEvents } from "../serviceBase";
import {
  BaseWithLoggingAndConfig,
  BaseWithLoggingAndConfigConfig,
  BSBPluginEvents,
  BSBPluginEventsRef,
  PluginEvents,
  BSBServiceClient,
  BSBReferencePluginConfigType,
  BSBReferencePluginConfigDefinition,
} from "./index";

export interface BSBServiceConstructor<
  ReferencedConfig extends BSBReferencePluginConfigType = any
> extends BaseWithLoggingAndConfigConfig<
    ReferencedConfig extends null
      ? null
      : BSBReferencePluginConfigDefinition<ReferencedConfig>
  > {
  sbEvents: SBEvents;
}

export abstract class BSBService<
  ReferencedConfig extends BSBReferencePluginConfigType = any,
  Events extends BSBPluginEvents = BSBPluginEventsRef
> extends BaseWithLoggingAndConfig<
  ReferencedConfig extends null
    ? null
    : BSBReferencePluginConfigDefinition<ReferencedConfig>
> {
  public static PLUGIN_NAME: string;
  public abstract readonly initBeforePlugins?: Array<string>;
  public abstract readonly initAfterPlugins?: Array<string>;
  public abstract readonly runBeforePlugins?: Array<string>;
  public abstract readonly runAfterPlugins?: Array<string>;
  public abstract readonly methods: ServiceEventsBase;
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

  constructor(config: BSBServiceConstructor<ReferencedConfig>) {
    super(config);
    this.events = new PluginEvents(config.mode, config.sbEvents, this);
  }
}

/**
 * DO NOT REFERENCE/USE THIS CLASS - IT IS AN INTERNALLY REFERENCED CLASS
 */
export class BSBServiceRef extends BSBService<null> {
  public static PLUGIN_NAME = "BSBServiceRef";
  public methods = {};
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
