import { BSBConfigDefinition, BaseWithLoggingAndConfig } from "./base";
import { ServiceEventsBase, ServiceEventsDefault } from "../interfaces/service";
import { DEBUG_MODE } from "../interfaces/logging";
import { SBLogging } from "../serviceBase/logging";
import { PluginEvents } from "./PluginEvents";
import { SBEvents } from "../serviceBase/events";
import { BSBServiceClient } from "./serviceClient";

export interface BSBServiceTypes {
  onEvents: ServiceEventsBase;
  emitEvents: ServiceEventsBase;
  onReturnableEvents: ServiceEventsBase;
  emitReturnableEvents: ServiceEventsBase;
  onBroadcast: ServiceEventsBase;
  emitBroadcast: ServiceEventsBase;
  methods: ServiceEventsBase;
}
export interface BSBServiceTypesDefault extends BSBServiceTypes {
  onEvents: ServiceEventsDefault;
  emitEvents: ServiceEventsDefault;
  onReturnableEvents: ServiceEventsDefault;
  emitReturnableEvents: ServiceEventsDefault;
  onBroadcast: ServiceEventsDefault;
  emitBroadcast: ServiceEventsDefault;
  methods: {};
}
export interface BSBServiceConstructor {
  appId: string;
  mode: DEBUG_MODE;
  pluginName: string;
  cwd: string;
  pluginCwd: string;
  config: any;
  sbLogging: SBLogging;
  sbEvents: SBEvents;
}
export abstract class BSBService<
  PluginConfigType extends BSBConfigDefinition = any,
  Events extends BSBServiceTypes = BSBServiceTypesDefault
> extends BaseWithLoggingAndConfig<PluginConfigType> {
  public abstract readonly initBeforePlugins?: Array<string>;
  public abstract readonly initAfterPlugins?: Array<string>;
  public abstract readonly runBeforePlugins?: Array<string>;
  public abstract readonly runAfterPlugins?: Array<string>;
  public abstract readonly methods: Events["methods"];
  public readonly events: PluginEvents<
    Events["onEvents"],
    Events["emitEvents"],
    Events["onReturnableEvents"],
    Events["emitReturnableEvents"],
    Events["onBroadcast"],
    Events["emitBroadcast"]
  >;
  public _clients: Array<BSBServiceClient<any>> = [];

  constructor(config: BSBServiceConstructor) {
    super(
      config.appId,
      config.mode,
      config.pluginName,
      config.cwd,
      config.pluginCwd,
      config.config,
      config.sbLogging
    );
    this.events = new PluginEvents(config.mode, config.sbEvents, this);
  }
}

/**
 * DO NOT REFERENCE/USE THIS CLASS - IT IS AN INTERNALLY REFERENCED CLASS
 */
export class BSBServiceRef extends BSBService<any> {
  public initBeforePlugins?: string[] | undefined;
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;
  public methods = {};
  dispose?(): void;
  init?(): void | Promise<void>;
  run?(): void | Promise<void>;
  constructor(config: BSBServiceConstructor) {
    super(config);
  }
}
