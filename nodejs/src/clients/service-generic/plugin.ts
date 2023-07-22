import { Readable } from "stream";
import { ServicesBase, ServicesClient } from "../../index";

export class GenericClient extends ServicesClient<
  any,
  any,
  any,
  any,
  any,
  any,
  any
> {
  public override pluginName: string = "";
  public constructor(self: ServicesBase, pluginName: string) {
    super(self);
    this.pluginName = pluginName;
  }

  public override async init(): Promise<void> {
    await this._plugin.log.warn(
      "Generic client ({pluginName}) is active. Generic client does not any type safety.",
      {
        pluginName: this.pluginName,
      }
    );
  }

  async emitEvent(event: string, ...data: Array<any>): Promise<void> {
    return await this._plugin.emitEvent(event, ...data);
  }
  async onEvent(
    event: string,
    listener: { (...data: Array<any>): Promise<void> }
  ): Promise<void> {
    return await this._plugin.onEvent(event, listener);
  }

  async emitEventSpecific(
    event: string,
    serverId: string,
    ...data: Array<any>
  ): Promise<void> {
    return await this._plugin.emitEventSpecific(serverId, event, ...data);
  }
  async onEventSpecific(
    event: string,
    serverId: string,
    listener: { (...data: Array<any>): Promise<void> }
  ): Promise<void> {
    return await this._plugin.onEventSpecific(serverId, event, listener);
  }

  async emitEventAndReturn<T = any>(
    event: string,
    ...data: Array<any>
  ): Promise<T> {
    return (await this._plugin.emitEventAndReturn(event, ...data)) as T;
  }
  async emitEventAndReturnTimed<T = any>(
    event: string,
    timeoutSeconds: number,
    ...data: Array<any>
  ): Promise<T> {
    return (await this._plugin.emitEventAndReturnTimed(
      event,
      timeoutSeconds,
      ...data
    )) as T;
  }
  async onReturnableEvent<T = any>(
    event: string,
    listener: { (...data: Array<any>): Promise<T> }
  ): Promise<void> {
    return await this._plugin.onReturnableEvent(event, listener);
  }

  async emitEventAndReturnSpecific<T = any>(
    event: string,
    serverId: string,
    ...data: Array<any>
  ): Promise<T> {
    return (await this._plugin.emitEventAndReturnSpecific(
      serverId,
      event,
      ...data
    )) as T;
  }
  async emitEventAndReturnTimedSpecific<T = any>(
    event: string,
    serverId: string,
    timeoutSeconds: number,
    ...data: Array<any>
  ): Promise<T> {
    return (await this._plugin.emitEventAndReturnTimedSpecific(
      serverId,
      event,
      timeoutSeconds,
      ...data
    )) as T;
  }
  async onReturnableEventSpecific<T = any>(
    event: string,
    serverId: string,
    listener: { (...data: Array<any>): Promise<T> }
  ): Promise<void> {
    return await this._plugin.onReturnableEventSpecific(
      serverId,
      event,
      listener
    );
  }

  async emitBroadcast(event: string, ...data: Array<any>): Promise<void> {
    return await this._plugin.emitBroadcast(event, ...data);
  }
  async onBroadcast(
    event: string,
    listener: { (...data: Array<any>): Promise<void> }
  ): Promise<void> {
    return await this._plugin.onBroadcast(event, listener);
  }

  async receiveStream(
    listener: { (error: Error | null, stream: Readable): Promise<void> },
    timeoutSeconds: number
  ): Promise<string> {
    return await this._plugin.receiveStream(listener, timeoutSeconds);
  }
  async sendStream(streamId: string, stream: Readable): Promise<void> {
    return await this._plugin.sendStream(streamId, stream);
  }
}
