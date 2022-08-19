import { EventType, IPluginEvents } from "../interfaces/events";
import { Plugin } from "../plugin/plugin";
import { Readable } from "stream";
import { IPluginConfig } from "../interfaces/config";
import { DefaultBase } from "../interfaces/base";
import { ErrorMessages } from "../interfaces/static";
import {
  DynamicallyReferencedMethod,
  DynamicallyReferencedMethodBase,
} from "@bettercorp/tools/lib/Interfaces";

export class RegisteredPlugin<
    DRMBI extends DynamicallyReferencedMethodBase,
    onEvents extends DynamicallyReferencedMethodBase,
    emitEvents extends DynamicallyReferencedMethodBase,
    onReturnableEvents extends DynamicallyReferencedMethodBase,
    emitReturnableEvents extends DynamicallyReferencedMethodBase,
    PluginConfigType extends IPluginConfig = any
  >
  extends DefaultBase<PluginConfigType>
  implements
    IPluginEvents<
      onEvents,
      emitEvents,
      onReturnableEvents,
      emitReturnableEvents
    >
{
  callPluginMethod<TA extends string>(
    ...args: DynamicallyReferencedMethod<DRMBI, TA>
  ): DynamicallyReferencedMethod<DRMBI, TA, false> {
    throw ErrorMessages.BSBNotInit;
  }

  onEvent<ArgsDataType = DefaultDataType>(
    event: onEvents,
    listener: (data: ArgsDataType) => Promise<void>
  ): Promise<void> {
    throw ErrorMessages.BSBNotInit;
  }

  onReturnableEvent<
    ArgsDataType = DefaultDataType,
    ReturnDataType = DefaultDataType
  >(
    event: onReturnableEvents,
    listener: (data?: ArgsDataType | undefined) => Promise<ReturnDataType>
  ): Promise<void> {
    throw ErrorMessages.BSBNotInit;
  }

  emitEvent<ArgsDataType = DefaultDataType>(
    event: emitEvents,
    data?: ArgsDataType | undefined
  ): Promise<void> {
    throw ErrorMessages.BSBNotInit;
  }

  emitEventAndReturn<
    ArgsDataType = DefaultDataType,
    ReturnDataType = DefaultReturnType
  >(
    event: emitReturnableEvents,
    data?: ArgsDataType | undefined,
    timeoutSeconds?: number | undefined
  ): Promise<ReturnDataType> {
    throw ErrorMessages.BSBNotInit;
  }

  receiveStream(
    listener: (error: Error | null, stream: Readable) => Promise<void>,
    timeoutSeconds?: number | undefined
  ): Promise<string> {
    throw ErrorMessages.BSBNotInit;
  }

  sendStream(streamId: string, stream: Readable): Promise<void> {
    throw ErrorMessages.BSBNotInit;
  }
}

export class PluginClient<
  onEvents extends DynamicallyReferencedMethodBase,
  emitEvents extends DynamicallyReferencedMethodBase,
  onReturnableEvents extends DynamicallyReferencedMethodBase,
  emitReturnableEvents extends DynamicallyReferencedMethodBase,
  PluginClientConfigType extends IPluginConfig = any
> {
  public readonly _pluginName: string = "override-me";
  public plugin: RegisteredPlugin<
    onEvents,
    emitEvents,
    onReturnableEvents,
    emitReturnableEvents,
    PluginClientConfigType
  >;

  constructor(self: Plugin) {
    this.plugin = self.registerPluginClient<
      onEvents,
      emitEvents,
      onReturnableEvents,
      emitReturnableEvents,
      PluginClientConfigType
    >(this._pluginName);
  }
}
