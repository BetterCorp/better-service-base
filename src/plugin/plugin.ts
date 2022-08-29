import { Tools } from "@bettercorp/tools/lib/Tools";
import { IPluginConfig } from "../interfaces/config";
import { IPluginLogger } from "../interfaces/logger";
import { IPlugin } from "../interfaces/plugin";
import { Readable } from "stream";
import { DefaultBase } from "../interfaces/base";
import { RegisteredPlugin } from "./pluginClient";
import { ErrorMessages } from "../interfaces/static";
import {
  DynamicallyReferencedMethodType,
} from "@bettercorp/tools/lib/Interfaces";
import {
  DynamicallyReferencedMethodOnIEvents,
  DynamicallyReferencedMethodEmitIEvents,
  DynamicallyReferencedMethodEmitEARIEvents,
} from "../interfaces/events";
import {
  PluginCallable, PluginEvents, PluginReturnableEvents,
} from "./base";

export class PluginBase<
    onEvents = PluginEvents,
    onReturnableEvents = PluginReturnableEvents,
    callableMethods = PluginCallable,
    pluginConfigType extends IPluginConfig = any
  >
  extends DefaultBase<pluginConfigType>
  implements 
    IPlugin<onEvents, onReturnableEvents>
{
  public readonly initIndex?: number;
  public readonly loadedIndex?: number;

  public registerPluginClient<
    pluginClientOnEvents ,
    pluginClientOnReturnableEvents ,
    pluginCallableMethods,
    pluginClientConfigType extends IPluginConfig
  >(
    pluginName: string
  ): RegisteredPlugin<
    pluginClientOnEvents,
    pluginClientOnReturnableEvents,
    pluginCallableMethods,
    pluginClientConfigType
  > {
    throw ErrorMessages.BSBNotInit;
  }

  constructor(pluginName: string, cwd: string, log: IPluginLogger) {
    super(pluginName, cwd, log);
    if (Tools.isNullOrUndefined(this.initIndex)) this.initIndex = -1;
    if (Tools.isNullOrUndefined(this.loadedIndex)) this.loadedIndex = 1;
  }
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
}
