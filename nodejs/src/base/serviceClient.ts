import {
  IPluginLogger,
  DynamicallyReferencedMethodCallable,
} from "../interfaces";
import { BSBService, BSBError, PluginEvents } from "./index";
import { DynamicallyReferencedMethodType } from "@bettercorp/tools/lib/Interfaces";

export abstract class BSBServiceClient<Service extends BSBService = any> {
  protected readonly log!: IPluginLogger;
  protected readonly events!: PluginEvents<
    Service["_virtual_internal_events"]["emitEvents"],
    Service["_virtual_internal_events"]["onEvents"],
    Service["_virtual_internal_events"]["emitReturnableEvents"],
    Service["_virtual_internal_events"]["onReturnableEvents"],
    Service["_virtual_internal_events"]["emitBroadcast"],
    Service["_virtual_internal_events"]["onBroadcast"]
  >;
  public callMethod<TA extends string>(
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
