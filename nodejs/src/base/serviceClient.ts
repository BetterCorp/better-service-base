import {
  IPluginLogger,
  DynamicallyReferencedMethodCallable,
} from "../interfaces";
import { BSBService, BSBError, PluginEvents, BSBServiceRef } from "./index";
import { DynamicallyReferencedMethodType } from "@bettercorp/tools/lib/Interfaces";

/**
 * @deprecated Use ServiceClient instead
 * @description [NOT REALLY DEPRECATED] - ONLY USE THIS IF YOU NEED SPECIFIC CLIENT LOGIC, OTHERWISE USE ServiceClient
 */
export abstract class BSBServiceClient<Service extends BSBService = any> {
  protected declare readonly log: IPluginLogger;
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
      }
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

export class ServiceClient<
  Service extends BSBService<any>,
  ServiceT extends typeof BSBServiceRef = any
> extends BSBServiceClient<Service> {
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
    this.pluginName = service.PLUGIN_NAME;
  }
}

/**
 * DO NOT REFERENCE/USE THIS CLASS - IT IS AN INTERNALLY REFERENCED CLASS
 */
export class BSBServiceClientRef extends BSBServiceClient<any> {
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
