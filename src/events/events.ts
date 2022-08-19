import { IPluginLogger } from "../interfaces/logger";
import { Readable } from "stream";
import { IPluginConfig } from "../interfaces/config";
import emit from "./emit";
import emitAndReturn from "./emitAndReturn";
import emitStreamAndReceiveStream from "./emitStreamAndReceiveStream";
import {
  DynamicallyReferencedMethodEmitEARIEvents,
  DynamicallyReferencedMethodEmitIEvents,
  DynamicallyReferencedMethodOnEARIEvents,
  DynamicallyReferencedMethodOnIEvents,
  IEvents,
} from "../interfaces/events";
import { DefaultBase } from "../interfaces/base";
import { ErrorMessages } from "../interfaces/static";
import { DynamicallyReferencedMethodBase } from "@bettercorp/tools/lib/Interfaces";

export class Events<
    onEvents extends DynamicallyReferencedMethodBase,
    emitEvents extends DynamicallyReferencedMethodBase,
    onReturnableEvents extends DynamicallyReferencedMethodBase,
    emitReturnableEvents extends DynamicallyReferencedMethodBase,
    PluginConfigType extends IPluginConfig = any
  >
  extends DefaultBase<PluginConfigType>
  implements
    IEvents<onEvents, emitEvents, onReturnableEvents, emitReturnableEvents>
{
  constructor(pluginName: string, cwd: string, log: IPluginLogger) {
    super(pluginName, cwd, log);
  }
  public async onEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodOnIEvents<onEvents, TA>
  ): Promise<void> {
    throw ErrorMessages.EventsNotImplementedProperly;
  }
  public async onReturnableEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodOnEARIEvents<onReturnableEvents, TA>
  ): Promise<void> {
    throw ErrorMessages.EventsNotImplementedProperly;
  }
  public async emitEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodEmitIEvents<emitEvents, TA>
  ): Promise<void> {
    throw ErrorMessages.EventsNotImplementedProperly;
  }
  public emitEventAndReturn<TA extends string>(
    ...args: DynamicallyReferencedMethodEmitEARIEvents<emitReturnableEvents, TA>
  ): DynamicallyReferencedMethodEmitEARIEvents<
    emitReturnableEvents,
    TA,
    false
  > {
    throw ErrorMessages.EventsNotImplementedProperly;
  }
  public async receiveStream(
    callerPluginName: string,
    listener: (error: Error | null, stream: Readable) => Promise<void>,
    timeoutSeconds?: number
  ): Promise<string> {
    throw ErrorMessages.EventsNotImplementedProperly;
  }
  sendStream(
    callerPluginName: string,
    streamId: string,
    stream: Readable
  ): Promise<void> {
    throw ErrorMessages.EventsNotImplementedProperly;
  }
}

export class DefaultEvents<
  onEvents extends DynamicallyReferencedMethodBase,
  emitEvents extends DynamicallyReferencedMethodBase,
  onReturnableEvents extends DynamicallyReferencedMethodBase,
  emitReturnableEvents extends DynamicallyReferencedMethodBase,
  PluginConfigType extends IPluginConfig = any
> extends Events<onEvents, emitEvents, onReturnableEvents, emitReturnableEvents, PluginConfigType> {
  protected emit!: emit<onEvents, emitEvents>;
  protected ear!: emitAndReturn<onReturnableEvents, emitReturnableEvents>;
  protected eas!: emitStreamAndReceiveStream;

  constructor(pluginName: string, cwd: string, log: IPluginLogger) {
    super(pluginName, cwd, log);

    this.emit = new emit(log);
    this.ear = new emitAndReturn(log);
    this.eas = new emitStreamAndReceiveStream(log);
  }

  public async onEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodOnIEvents<onEvents, TA>
  ): Promise<void> {
    await this.emit.onEvent(...args);
  }
  public async emitEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodEmitIEvents<emitEvents, TA>
  ): Promise<void> {
    this.emit.emitEvent(...args);
  }
  public async onReturnableEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodOnEARIEvents<onReturnableEvents, TA>
  ): Promise<void> {
    this.ear.onReturnableEvent<ArgsDataType, ReturnDataType>(
      callerPluginName,
      pluginName,
      event,
      listener
    );
  }
  public async emitEventAndReturn<TA extends string>(
    ...args: DynamicallyReferencedMethodEmitEARIEvents<emitReturnableEvents, TA>
  ): DynamicallyReferencedMethodEmitEARIEvents<
    emitReturnableEvents,
    TA,
    false
  > {
    return this.ear.emitReturnableEvent<ArgsDataType, ReturnDataType>(
      callerPluginName,
      pluginName,
      event,
      data,
      timeoutSeconds
    );
  }
  public async receiveStream(
    callerPluginName: string,
    listener: { (error: Error | null, stream: Readable): Promise<void> },
    timeoutSeconds?: number
  ): Promise<string> {
    return this.eas.receiveStream(callerPluginName, listener, timeoutSeconds);
  }
  public async sendStream(
    callerPluginName: string,
    streamId: string,
    stream: Readable
  ): Promise<void> {
    return this.eas.sendStream(callerPluginName, streamId, stream);
  }
}
