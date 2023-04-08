import {
  DynamicallyReferencedMethodEmitEARIEvents,
  DynamicallyReferencedMethodEmitIEvents,
  DynamicallyReferencedMethodOnIEvents,
  IServiceEvents,
} from "../interfaces/events";
import { ServicesBase } from "./service";
import { Readable } from "stream";
import { IPluginConfig } from "../interfaces/config";
import { DefaultBase } from "../interfaces/base";
import { ErrorMessages } from "../interfaces/static";
import {
  DynamicallyReferencedMethod,
  DynamicallyReferencedMethodType,
} from "@bettercorp/tools/lib/Interfaces";
import {
  ServiceEvents,
  ServiceReturnableEvents,
  ServiceCallable,
} from "./base";

export class RegisteredPlugin<
    onEvents,
    emitEvents,
    onReturnableEvents,
    emitReturnableEvents,
    callableMethods,
    PluginConfigType extends IPluginConfig
  >
  extends DefaultBase<PluginConfigType>
  implements
    IServiceEvents<
      emitEvents,
      onEvents,
      emitReturnableEvents,
      onReturnableEvents
    >
{
  receiveStream(
    listener: (error: Error | null, stream: Readable) => Promise<void>,
    timeoutSeconds?: number
  ): Promise<string> {
    throw ErrorMessages.BSBNotInit;
  }
  sendStream(streamId: string, stream: Readable): Promise<void> {
    throw ErrorMessages.BSBNotInit;
  }
  onEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodOnIEvents<
      DynamicallyReferencedMethodType<emitEvents>,
      TA,
      false
    >
  ): Promise<void> {
    throw ErrorMessages.BSBNotInit;
  }
  onEventSpecific<TA extends string>(serverId: string,
    ...args: DynamicallyReferencedMethodOnIEvents<
      DynamicallyReferencedMethodType<emitEvents>,
      TA,
      false
    >
  ): Promise<void> {
    throw ErrorMessages.BSBNotInit;
  }
  emitEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodEmitIEvents<
      DynamicallyReferencedMethodType<onEvents>,
      TA
    >
  ): Promise<void> {
    throw ErrorMessages.BSBNotInit;
  }
  emitEventSpecific<TA extends string>(serverId: string,
    ...args: DynamicallyReferencedMethodEmitIEvents<
      DynamicallyReferencedMethodType<onEvents>,
      TA
    >
  ): Promise<void> {
    throw ErrorMessages.BSBNotInit;
  }
  onReturnableEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodOnIEvents<
      DynamicallyReferencedMethodType<emitReturnableEvents>,
      TA,
      true
    >
  ): Promise<void> {
    throw ErrorMessages.BSBNotInit;
  }
  onReturnableEventSpecific<TA extends string>(serverId: string,
    ...args: DynamicallyReferencedMethodOnIEvents<
      DynamicallyReferencedMethodType<emitReturnableEvents>,
      TA,
      true
    >
  ): Promise<void> {
    throw ErrorMessages.BSBNotInit;
  }
  emitEventAndReturn<TA extends string>(
    ...args: DynamicallyReferencedMethodEmitEARIEvents<
      DynamicallyReferencedMethodType<onReturnableEvents>,
      TA,
      true,
      false
    >
  ): DynamicallyReferencedMethodEmitEARIEvents<
    DynamicallyReferencedMethodType<emitReturnableEvents>,
    TA,
    false
  > {
    throw ErrorMessages.BSBNotInit;
  }
  emitEventAndReturnSpecific<TA extends string>(serverId: string,
    ...args: DynamicallyReferencedMethodEmitEARIEvents<
      DynamicallyReferencedMethodType<onReturnableEvents>,
      TA,
      true,
      false
    >
  ): DynamicallyReferencedMethodEmitEARIEvents<
    DynamicallyReferencedMethodType<emitReturnableEvents>,
    TA,
    false
  > {
    throw ErrorMessages.BSBNotInit;
  }
  emitEventAndReturnTimed<TA extends string>(
    ...args: DynamicallyReferencedMethodEmitEARIEvents<
      DynamicallyReferencedMethodType<onReturnableEvents>,
      TA,
      true,
      true
    >
  ): DynamicallyReferencedMethodEmitEARIEvents<
    DynamicallyReferencedMethodType<emitReturnableEvents>,
    TA,
    false
  > {
    throw ErrorMessages.BSBNotInit;
  }
  emitEventAndReturnTimedSpecific<TA extends string>(serverId: string,
    ...args: DynamicallyReferencedMethodEmitEARIEvents<
      DynamicallyReferencedMethodType<onReturnableEvents>,
      TA,
      true,
      true
    >
  ): DynamicallyReferencedMethodEmitEARIEvents<
    DynamicallyReferencedMethodType<emitReturnableEvents>,
    TA,
    false
  > {
    throw ErrorMessages.BSBNotInit;
  }
  callPluginMethod<TA extends string>(
    ...args: DynamicallyReferencedMethod<
      DynamicallyReferencedMethodType<callableMethods>,
      TA
    >
  ): DynamicallyReferencedMethod<
    DynamicallyReferencedMethodType<callableMethods>,
    TA,
    false
  > {
    throw ErrorMessages.BSBNotInit;
  }
}

export class ServicesClient<
  onEvents = ServiceEvents,
  emitEvents = ServiceEvents,
  onReturnableEvents = ServiceReturnableEvents,
  emitReturnableEvents = ServiceReturnableEvents,
  callableMethods = ServiceCallable
> {
  public readonly _pluginName!: string;
  public readonly initBeforePlugins?: Array<string>;
  public readonly initAfterPlugins?: Array<string>;
  public readonly runBeforePlugins?: Array<string>;
  public readonly runAfterPlugins?: Array<string>;

  private _referencedPlugin: ServicesBase<any, any, any, any>;
  protected _plugin!: RegisteredPlugin<
    onEvents,
    emitEvents,
    onReturnableEvents,
    emitReturnableEvents,
    callableMethods,
    any
  >;
  protected async _register(): Promise<void> {
    // We must add the inits/runs list to the referenced service in order to change the init and run order
    (this._referencedPlugin as any).initBeforePlugins = (
      this._referencedPlugin.initBeforePlugins || []
    ).concat(this.initBeforePlugins || []);
    (this._referencedPlugin as any).initAfterPlugins = (
      this._referencedPlugin.initAfterPlugins || []
    ).concat(this.initAfterPlugins || []);
    (this._referencedPlugin as any).runBeforePlugins = (
      this._referencedPlugin.runBeforePlugins || []
    ).concat(this.runBeforePlugins || []);
    (this._referencedPlugin as any).runAfterPlugins = (
      this._referencedPlugin.runAfterPlugins || []
    ).concat(this.runAfterPlugins || []);
    if (this._plugin === undefined) {
      this._plugin = await this._referencedPlugin.registerPluginClient<
        onEvents,
        emitEvents,
        onReturnableEvents,
        emitReturnableEvents,
        callableMethods,
        any
      >(this._pluginName);
    }
  }

  constructor(self: ServicesBase<any, any, any>) {
    this._referencedPlugin = self;
    (self as any)._clients.push(this);
  }
}
