import { IPluginLogger } from "../../interfaces/logger";
import { Readable } from "stream";
import emit from "./events/emit";
import emitAndReturn from "./events/emitAndReturn";
import emitStreamAndReceiveStream from "./events/emitStreamAndReceiveStream";
import { EventsBase } from "../../events/events";
import { PluginConfig } from "./sec.config";

export class Events extends EventsBase<PluginConfig> {
  protected emit!: emit;
  protected ear!: emitAndReturn;
  protected eas!: emitStreamAndReceiveStream;

  constructor(pluginName: string, cwd: string, log: IPluginLogger) {
    super(pluginName, cwd, log);

    this.emit = new emit(log);
    this.ear = new emitAndReturn(log);
    this.eas = new emitStreamAndReceiveStream(log);
  }

  public dispose() {
    this.emit.dispose();
    this.ear.dispose();
    this.eas.dispose();
  }

  public async onEvent(
    callerPluginName: string,
    pluginName: string,
    event: string,
    listener: { (args: Array<any>): Promise<void> }
  ): Promise<void> {
    await this.emit.onEvent(callerPluginName, pluginName, event, listener);
  }
  public async emitEvent(
    callerPluginName: string,
    pluginName: string,
    event: string,
    args: Array<any>
  ): Promise<void> {
    this.emit.emitEvent(callerPluginName, pluginName, event, args);
  }

  public async onReturnableEvent(
    callerPluginName: string,
    pluginName: string,
    event: string,
    listener: { (args: Array<any>): Promise<any> }
  ): Promise<void> {
    this.ear.onReturnableEvent(callerPluginName, pluginName, event, listener);
  }
  public async emitEventAndReturn(
    callerPluginName: string,
    pluginName: string,
    event: string,
    timeoutSeconds: number,
    args: Array<any>
  ): Promise<any> {
    return this.ear.emitEventAndReturn(
      callerPluginName,
      pluginName,
      event,
      timeoutSeconds,
      args
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
