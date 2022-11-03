import { IPluginLogger } from "../interfaces/logger";
import { Readable } from "stream";
import { IPluginConfig } from "../interfaces/config";
import { DefaultBase } from "../interfaces/base";
import { ErrorMessages } from "../interfaces/static";

export class EventsBase<PluginConfigType extends IPluginConfig = any>
  extends DefaultBase<PluginConfigType>
{
  constructor(pluginName: string, cwd: string,pluginCwd: string, log: IPluginLogger) {
    super(pluginName, cwd, pluginCwd, log);
  }
  public async onEvent(
    callerPluginName: string,
    pluginName: string,
    event: string,
    listener: { (args: Array<any>): Promise<void> }
  ): Promise<void> {
    throw ErrorMessages.EventsNotImplementedProperly;
  }
  public async onReturnableEvent(
    callerPluginName: string,
    pluginName: string,
    event: string,
    listener: { (args: Array<any>): Promise<any> }
  ): Promise<void> {
    throw ErrorMessages.EventsNotImplementedProperly;
  }
  public async emitEvent(
    callerPluginName: string,
    pluginName: string,
    event: string,
    args: Array<any>
  ): Promise<void> {
    throw ErrorMessages.EventsNotImplementedProperly;
  }
  public async emitEventAndReturn(
    callerPluginName: string,
    pluginName: string,
    event: string,
    timeoutSeconds: number,
    args: Array<any>
  ): Promise<any> {
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
