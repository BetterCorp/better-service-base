import { Tools } from "@bettercorp/tools/lib/Tools";
import { IPluginConfig } from "../interfaces/config";
import { IPluginLogger } from "../interfaces/logger";
import { IPlugin } from "../interfaces/plugin";
import { Readable } from "stream";
import { DefaultBase } from "../interfaces/base";
import { EventType } from "../interfaces/events";
import { RegisteredPlugin } from "./pluginClient";
import { ErrorMessages } from "../interfaces/static";
import { DynamicallyReferencedMethodBase } from '@bettercorp/tools/lib/Interfaces';

export class Plugin<
    onEvents  extends DynamicallyReferencedMethodBase,
    emitEvents  extends DynamicallyReferencedMethodBase,
    onReturnableEvents  extends DynamicallyReferencedMethodBase,
    emitReturnableEvents  extends DynamicallyReferencedMethodBase,
    PluginConfigType extends IPluginConfig = any
  >
  extends DefaultBase<PluginConfigType>
  implements
    IPlugin<
      onEvents,
      emitEvents,
      onReturnableEvents,
      emitReturnableEvents
    >
{
  public readonly initIndex?: number;
  public readonly loadedIndex?: number;

  public registerPluginClient<
    onEvents = EventType,
    emitClientEvents = EventType,
    onClientReturnableEvents = EventType,
    emitClientReturnableEvents = EventType,
    PluginClientConfigType extends IPluginConfig = any,
    DefaultClientDataType = any,
    DefaultClientReturnType = void
  >(
    pluginName: string
  ): RegisteredPlugin<
    onEvents,
    emitClientEvents,
    onClientReturnableEvents,
    emitClientReturnableEvents,
    PluginClientConfigType
  > {
    throw ErrorMessages.BSBNotInit;
  }

  constructor(pluginName: string, cwd: string, log: IPluginLogger) {
    super(pluginName, cwd, log);
    if (Tools.isNullOrUndefined(this.initIndex)) this.initIndex = -1;
    if (Tools.isNullOrUndefined(this.loadedIndex)) this.loadedIndex = 1;
  }
  onEvent<ArgsDataType = any>(
    event: onEvents,
    listener: (data: ArgsDataType) => Promise<void>
  ): Promise<void> {
    throw ErrorMessages.PluginNotImplementedProperly;
  }
  onReturnableEvent<ArgsDataType = any, ReturnDataType = any>(
    event: onReturnableEvents,
    listener: (data?: ArgsDataType | undefined) => Promise<ReturnDataType>
  ): Promise<void> {
    throw ErrorMessages.PluginNotImplementedProperly;
  }
  emitEvent<ArgsDataType = any>(
    event: emitEvents,
    data?: ArgsDataType | undefined
  ): Promise<void> {
    throw ErrorMessages.PluginNotImplementedProperly;
  }
  emitEventAndReturn<ArgsDataType = any, ReturnDataType = void>(
    event: emitReturnableEvents,
    data?: ArgsDataType | undefined,
    timeoutSeconds?: number | undefined
  ): Promise<ReturnDataType> {
    throw ErrorMessages.PluginNotImplementedProperly;
  }
  receiveStream(
    listener: (error: Error | null, stream: Readable) => Promise<void>,
    timeoutSeconds?: number | undefined
  ): Promise<string> {
    throw ErrorMessages.PluginNotImplementedProperly;
  }
  sendStream(streamId: string, stream: Readable): Promise<void> {
    throw ErrorMessages.PluginNotImplementedProperly;
  }
}
