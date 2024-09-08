import {
  DynamicallyReferencedMethodCallable,
  DynamicallyReferencedMethodType,
  IPluginLogger,
  IPluginMetrics,
} from "../interfaces";
import {BSBService, BSBServiceRef} from "./BSBService";
import {BSBError} from "./errorMessages";
import {PluginEvents} from "./PluginEvents";
import {Tools} from "./tools";

/**
 * @hidden
 * ONLY USE THIS IF YOU NEED SPECIFIC CLIENT LOGIC, OTHERWISE USE ServiceClient
 */
export abstract class BSBServiceClient<Service extends BSBService = any> {
  public declare readonly log: IPluginLogger;
  public declare readonly metrics: IPluginMetrics;
  protected declare readonly events: PluginEvents<
      Service["_virtual_internal_events"]["emitEvents"],
      Service["_virtual_internal_events"]["onEvents"],
      Service["_virtual_internal_events"]["emitReturnableEvents"],
      Service["_virtual_internal_events"]["onReturnableEvents"],
      Service["_virtual_internal_events"]["emitBroadcast"],
      Service["_virtual_internal_events"]["onBroadcast"]
  >;

  protected callMethod<TA extends keyof Service["methods"]>(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ...args: DynamicallyReferencedMethodCallable<
          DynamicallyReferencedMethodType<Service["methods"]>,
          TA
      >
  ): DynamicallyReferencedMethodCallable<
      DynamicallyReferencedMethodType<Service["methods"]>,
      TA,
      false
  > {
    throw new BSBError(
        "The plugin {plugin} is not enabled so you cannot call methods from it",
        {
          plugin: this.pluginName,
        },
    );
  }

  constructor(context: BSBService) {
    context._clients.push(this);
  }

  public abstract readonly pluginName: string;
  public abstract readonly initBeforePlugins?: Array<string>;
  public abstract readonly initAfterPlugins?: Array<string>;
  public abstract readonly runBeforePlugins?: Array<string>;
  public abstract readonly runAfterPlugins?: Array<string>;

  public abstract dispose?(): void;

  public abstract init?(): Promise<void>;

  public abstract run?(): Promise<void>;
}

/**
 * @group Services
 * @category Using Plugins
 */
export class ServiceClient<
    Service extends BSBService<any>,
    ServiceT extends typeof BSBServiceRef = any
>
    extends BSBServiceClient<Service> {
  public readonly pluginName: string = "{UNSET SERVICE CLIENT PLUGIN NAME}";
  public readonly initBeforePlugins?: Array<string>;
  public readonly initAfterPlugins?: Array<string>;
  public readonly runBeforePlugins?: Array<string>;
  public readonly runAfterPlugins?: Array<string>;

  public dispose?(): void;

  public init?(): Promise<void>;

  public run?(): Promise<void>;

  public override callMethod<TA extends keyof Service["methods"]>(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ...args: DynamicallyReferencedMethodCallable<
          DynamicallyReferencedMethodType<Service["methods"]>,
          TA
      >
  ): DynamicallyReferencedMethodCallable<
      DynamicallyReferencedMethodType<Service["methods"]>,
      TA,
      false
  > {
    return this.callMethod(...args);
  }

  public declare events: PluginEvents<
      Service["_virtual_internal_events"]["emitEvents"],
      Service["_virtual_internal_events"]["onEvents"],
      Service["_virtual_internal_events"]["emitReturnableEvents"],
      Service["_virtual_internal_events"]["onReturnableEvents"],
      Service["_virtual_internal_events"]["emitBroadcast"],
      Service["_virtual_internal_events"]["onBroadcast"]
  >;

  constructor(service: ServiceT, context: BSBService) {
    super(context);
    if (!Tools.isObject(service.PLUGIN_CLIENT)) {
      throw new BSBError("Plugin client is not defined in the service!");
    }
    if (!Tools.isString(service.PLUGIN_CLIENT.name)) {
      throw new BSBError("Plugin client name is not defined in the service!");
    }
    this.pluginName = service.PLUGIN_CLIENT.name;
    this.initBeforePlugins = service.PLUGIN_CLIENT.initBeforePlugins;
    this.initAfterPlugins = service.PLUGIN_CLIENT.initAfterPlugins;
    this.runBeforePlugins = service.PLUGIN_CLIENT.runBeforePlugins;
    this.runAfterPlugins = service.PLUGIN_CLIENT.runAfterPlugins;
  }
}

/**
 * @hidden
 * DO NOT REFERENCE/USE THIS CLASS - IT IS AN INTERNALLY REFERENCED CLASS
 */
export class BSBServiceClientRef
    extends BSBServiceClient<any> {
  public pluginName: string = "";
  public initBeforePlugins?: string[] | undefined;
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;

  public dispose?(): void {
    throw new Error("Method not implemented.");
  }

  public init?(): Promise<void> {
    throw new Error("Method not implemented.");
  }

  public run?(): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
