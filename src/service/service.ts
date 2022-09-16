import { Tools } from "@bettercorp/tools/lib/Tools";
import { IPluginConfig } from "../interfaces/config";
import { IPluginLogger } from "../interfaces/logger";
import { IService } from "../interfaces/service";
import { Readable } from "stream";
import { DefaultBase } from "../interfaces/base";
import { RegisteredPlugin } from "./serviceClient";
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
  ServiceCallable, ServiceEvents, ServiceReturnableEvents,
} from "./base";

export class ServicesBase<
    onEvents = ServiceEvents,
    emitEvents = ServiceEvents,
    onReturnableEvents = ServiceReturnableEvents,
    emitReturnableEvents = ServiceReturnableEvents,
    callableMethods = ServiceCallable,
    pluginConfigType extends IPluginConfig = any
  >
  extends DefaultBase<pluginConfigType>
  implements 
    IService<onEvents, emitEvents, onReturnableEvents, emitReturnableEvents>
{
  public readonly initBeforePlugins?: Array<string>;
  public readonly initAfterPlugins?: Array<string>;
  public readonly runBeforePlugins?: Array<string>;
  public readonly runAfterPlugins?: Array<string>;

  async run(): Promise<void> {}

  public registerPluginClient<
    pluginClientOnEvents ,
    pluginClientEmitEvents ,
    pluginClientOnReturnableEvents ,
    pluginClientEmitReturnableEvents ,
    pluginCallableMethods,
    pluginClientConfigType extends IPluginConfig
  >(
    pluginName: string
  ): Promise<RegisteredPlugin<
    pluginClientOnEvents,
    pluginClientEmitEvents,
    pluginClientOnReturnableEvents,
    pluginClientEmitReturnableEvents,
    pluginCallableMethods,
    pluginClientConfigType
  >> {
    throw ErrorMessages.BSBNotInit;
  }

  constructor(pluginName: string, cwd: string, log: IPluginLogger) {
    super(pluginName, cwd, log);
    if (Tools.isNullOrUndefined(this.initBeforePlugins)) this.initBeforePlugins = [];
    if (Tools.isNullOrUndefined(this.initAfterPlugins)) this.initAfterPlugins = [];
    if (Tools.isNullOrUndefined(this.runBeforePlugins)) this.runBeforePlugins = [];
    if (Tools.isNullOrUndefined(this.runAfterPlugins)) this.runAfterPlugins = [];
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
      DynamicallyReferencedMethodType<emitEvents>,
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
      DynamicallyReferencedMethodType<emitReturnableEvents>,
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
      DynamicallyReferencedMethodType<emitReturnableEvents>,
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
