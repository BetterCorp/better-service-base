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
    onReturnableEvents,
    callableMethods,
    PluginConfigType extends IPluginConfig
  >
  extends DefaultBase<PluginConfigType>
  implements IServiceEvents<onEvents, onReturnableEvents>
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

export class ServicesClient<
  onEvents = ServiceEvents,
  onReturnableEvents = ServiceReturnableEvents,
  callableMethods = ServiceCallable,
  PluginClientConfigType extends IPluginConfig = any
> {
  public readonly _pluginName!: string;
  private _referencedPlugin: ServicesBase<any, any, any, any>;
  protected _plugin!: RegisteredPlugin<
    onEvents,
    onReturnableEvents,
    callableMethods,
    PluginClientConfigType
  >;
  protected async _register(): Promise<void> {
    if (this._plugin === undefined) {
      this._plugin = await this._referencedPlugin.registerPluginClient<
        onEvents,
        onReturnableEvents,
        callableMethods,
        PluginClientConfigType
      >(this._pluginName);
    }
  }

  constructor(self: ServicesBase<any, any, any>) {
    this._referencedPlugin = self;
  }
}
