import { PluginEvents } from "./PluginEvents";
import { IPluginLogger } from "../interfaces/logging";
import { BSBService, BSBServiceTypes, BSBServiceTypesDefault } from "./service";
import { DynamicallyReferencedMethodCallable } from "../interfaces/events";
import { DynamicallyReferencedMethodType } from "@bettercorp/tools/lib/Interfaces";
import { BSBError } from "./errorMessages";

export abstract class BSBServiceClient<
  Events extends BSBServiceTypes = BSBServiceTypesDefault
> {
  protected readonly log!: IPluginLogger;
  protected readonly events!: PluginEvents<
    Events["emitEvents"],
    Events["onEvents"],
    Events["emitReturnableEvents"],
    Events["onReturnableEvents"],
    Events["emitBroadcast"],
    Events["onBroadcast"]
  >;
  public callMethod<TA extends string>(
    ...args: DynamicallyReferencedMethodCallable<
      DynamicallyReferencedMethodType<Events["methods"]>,
      TA
    >
  ): DynamicallyReferencedMethodCallable<
    DynamicallyReferencedMethodType<Events["methods"]>,
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
  constructor(context: BSBService<any, any>) {
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
