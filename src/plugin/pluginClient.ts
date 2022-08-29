import {
  DynamicallyReferencedMethodEmitEARIEvents,
  DynamicallyReferencedMethodEmitIEvents,
  DynamicallyReferencedMethodOnIEvents,
  IPluginEvents,
} from "../interfaces/events";
import { PluginBase } from "../plugin/plugin";
import { Readable } from "stream";
import { IPluginConfig } from "../interfaces/config";
import { DefaultBase } from "../interfaces/base";
import { ErrorMessages } from "../interfaces/static";
import {
  DynamicallyReferencedMethod,
  DynamicallyReferencedMethodType,
} from "@bettercorp/tools/lib/Interfaces";
import { PluginEvents, PluginReturnableEvents, PluginCallable } from "./base";

export class RegisteredPlugin<
    onEvents,
    onReturnableEvents,
    callableMethods,
    PluginConfigType extends IPluginConfig
  >
  extends DefaultBase<PluginConfigType>
  implements IPluginEvents<onEvents, onReturnableEvents>
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
      DynamicallyReferencedMethodType<onEvents>,
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
  onReturnableEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodOnIEvents<
      DynamicallyReferencedMethodType<onReturnableEvents>,
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
    DynamicallyReferencedMethodType<onReturnableEvents>,
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
    DynamicallyReferencedMethodType<onReturnableEvents>,
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

export class PluginClient<
  onEvents = PluginEvents,
  onReturnableEvents = PluginReturnableEvents,
  callableMethods = PluginCallable,
  PluginClientConfigType extends IPluginConfig = any
> {
  public readonly _pluginName!: string;
  private _referencedPlugin: PluginBase<any, any, any, any>;
  private _plugin?: RegisteredPlugin<
    onEvents,
    onReturnableEvents,
    callableMethods,
    PluginClientConfigType
  >;
  protected get plugin(): RegisteredPlugin<
    onEvents,
    onReturnableEvents,
    callableMethods,
    PluginClientConfigType
  > {
    if (this._plugin === undefined) {
      this._plugin = this._referencedPlugin.registerPluginClient<
        onEvents,
        onReturnableEvents,
        callableMethods,
        PluginClientConfigType
      >(this._pluginName);
    }
    return this._plugin;
  }

  constructor(self: PluginBase<any, any, any>) {
    this._referencedPlugin = self;
  }
}
