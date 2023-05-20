import { IPluginLogger } from "../../interfaces/logger";
import { Readable } from "stream";
import emit from "./events/emit";
import emitAndReturn from "./events/emitAndReturn";
import emitStreamAndReceiveStream from "./events/emitStreamAndReceiveStream";
import { EventsBase } from "../../events/events";
import { PluginConfig } from "./sec.config";
import broadcast from './events/broadcast';

export class Events extends EventsBase<PluginConfig> {
  protected broadcast!: broadcast;
  protected emit!: emit;
  protected ear!: emitAndReturn;
  protected eas!: emitStreamAndReceiveStream;

  constructor(
    pluginName: string,
    cwd: string,
    pluginCwd: string,
    log: IPluginLogger
  ) {
    super(pluginName, cwd, pluginCwd, log);

    this.broadcast = new broadcast(log);
    this.emit = new emit(log);
    this.ear = new emitAndReturn(log);
    this.eas = new emitStreamAndReceiveStream(log);
  }

  public dispose() {
    this.broadcast.dispose();
    this.emit.dispose();
    this.ear.dispose();
    this.eas.dispose();
  }

  public async onBroadcast(
    callerPluginName: string,
    pluginName: string,
    event: string,
    listener: { (args: Array<any>): Promise<void> }
  ): Promise<void> {
    await this.broadcast.onBroadcast(callerPluginName, pluginName, event, listener);
  }
  public async emitBroadcast(
    callerPluginName: string,
    pluginName: string,
    event: string,
    args: Array<any>
  ): Promise<void> {
    await this.broadcast.emitBroadcast(callerPluginName, pluginName, event, args);
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
    await this.emit.emitEvent(callerPluginName, pluginName, event, args);
  }

  public async onReturnableEvent(
    callerPluginName: string,
    pluginName: string,
    event: string,
    listener: { (args: Array<any>): Promise<any> }
  ): Promise<void> {
    await this.ear.onReturnableEvent(
      callerPluginName,
      pluginName,
      event,
      listener
    );
  }
  public async emitEventAndReturn(
    callerPluginName: string,
    pluginName: string,
    event: string,
    timeoutSeconds: number,
    args: Array<any>
  ): Promise<any> {
    return await this.ear.emitEventAndReturn(
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
