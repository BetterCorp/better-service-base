import { Readable } from "stream";
import emit from "./events/emit";
import emitAndReturn from "./events/emitAndReturn";
import emitStreamAndReceiveStream from "./events/emitStreamAndReceiveStream";
import broadcast from "./events/broadcast";
import { BSBEvents, BSBEventsConstructor } from "../../base/events";

export class Plugin extends BSBEvents {
  init?(): void;
  protected broadcast!: broadcast;
  protected emit!: emit;
  protected ear!: emitAndReturn;
  protected eas!: emitStreamAndReceiveStream;

  constructor(config: BSBEventsConstructor) {
    super(config);

    this.broadcast = new broadcast(this.createNewLogger("broadcast"));
    this.emit = new emit(this.createNewLogger("emit"));
    this.ear = new emitAndReturn(this.createNewLogger("emitAndReturn"));
    this.eas = new emitStreamAndReceiveStream(this.createNewLogger("stream"));
  }

  public dispose() {
    this.broadcast.dispose();
    this.emit.dispose();
    this.ear.dispose();
    this.eas.dispose();
  }

  public async onBroadcast(
    pluginName: string,
    event: string,
    listener: { (args: Array<any>): Promise<void> }
  ): Promise<void> {
    await this.broadcast.onBroadcast(pluginName, event, listener);
  }
  public async emitBroadcast(
    pluginName: string,
    event: string,
    args: Array<any>
  ): Promise<void> {
    await this.broadcast.emitBroadcast(pluginName, event, args);
  }

  public async onEvent(
    pluginName: string,
    event: string,
    listener: { (args: Array<any>): Promise<void> }
  ): Promise<void> {
    await this.emit.onEvent(pluginName, event, listener);
  }
  public async emitEvent(
    pluginName: string,
    event: string,
    args: Array<any>
  ): Promise<void> {
    await this.emit.emitEvent(pluginName, event, args);
  }

  public async onReturnableEvent(
    pluginName: string,
    event: string,
    listener: { (args: Array<any>): Promise<any> }
  ): Promise<void> {
    await this.ear.onReturnableEvent(pluginName, event, listener);
  }
  public async emitEventAndReturn(
    pluginName: string,
    event: string,
    timeoutSeconds: number,
    args: Array<any>
  ): Promise<any> {
    return await this.ear.emitEventAndReturn(
      pluginName,
      event,
      timeoutSeconds,
      args
    );
  }

  public async receiveStream(
    event: string,
    listener: { (error: Error | null, stream: Readable): Promise<void> },
    timeoutSeconds?: number
  ): Promise<string> {
    return this.eas.receiveStream(event, listener, timeoutSeconds);
  }
  public async sendStream(
    event: string,
    streamId: string,
    stream: Readable
  ): Promise<void> {
    return this.eas.sendStream(event, streamId, stream);
  }
}
