import { EventsBase, IPluginLogger } from "@bettercorp/service-base";
import { Readable } from "stream";
import { PluginConfig } from "./sec.config";

export class Events extends EventsBase<PluginConfig> {
  constructor(
    pluginName: string,
    cwd: string,
    pluginCwd: string,
    log: IPluginLogger
  ) {
    super(pluginName, cwd, pluginCwd, log);
    /**
     * Add any other constructor code here
  }

  public dispose() {
    /**
     * TODO: dispose of all events
     *
     * Cleanup/close connections that are not needed.
     */
  }

  public override async onBroadcast(
    callerPluginName: string,
    pluginName: string,
    event: string,
    listener: { (args: Array<any>): Promise<void> }
  ): Promise<void> {
    /**
     * TODO: implement
     *
     * This function allows for a plugin to listen to events that are emitted by other plugins
     * The difference between an emitEvent and an emitBroadcast is that an emitEvent is only
     * handled by a single plugin whereas an emitBroadcast is handled by all plugins listening
     * for that event
     */
  }
  public override async emitBroadcast(
    callerPluginName: string,
    pluginName: string,
    event: string,
    args: Array<any>
  ): Promise<void> {
    /**
     * TODO: implement
     *
     * This function allows for a plugin to emit an event that is handled by all plugins listening
     * for that event
     */
  }

  public override async onEvent(
    callerPluginName: string,
    pluginName: string,
    event: string,
    listener: { (args: Array<any>): Promise<void> }
  ): Promise<void> {
    /**
     * TODO: implement
     *
     * This function allows for a plugin to listen to events that are emitted by other plugins
     * The difference between an emitEvent and an emitBroadcast is that an emitEvent is only
     * handled by a single plugin
     */
  }

  public override async emitEvent(
    callerPluginName: string,
    pluginName: string,
    event: string,
    args: Array<any>
  ): Promise<void> {
    /**
     * TODO: implement
     *
     * This function allows for a plugin to emit an event that is handled by a single plugin
     */
  }

  public override async onReturnableEvent(
    callerPluginName: string,
    pluginName: string,
    event: string,
    listener: { (args: Array<any>): Promise<any> }
  ): Promise<void> {
    /**
     * TODO: implement
     *
     * This function allows for a plugin to listen to events that are emitted by other plugins
     * and return a value to the caller
     */
  }

  public override async emitEventAndReturn(
    callerPluginName: string,
    pluginName: string,
    event: string,
    timeoutSeconds: number,
    args: Array<any>
  ): Promise<any> {
    /**
     * TODO: implement
     *
     * This function allows for a plugin to emit an event that is handled by a single plugin
     * and returns a value to the caller
     */
  }

  public override async receiveStream(
    callerPluginName: string,
    listener: { (error: Error | null, stream: Readable): Promise<void> },
    timeoutSeconds?: number
  ): Promise<string> {
    /**
     * TODO: implement
     *
     * This function allows for a plugin to receive a stream from another plugin
     * and returns a streamId that can be used to send data back to the caller
     */
  }

  public override async sendStream(
    callerPluginName: string,
    streamId: string,
    stream: Readable
  ): Promise<void> {
    /**
     * TODO: implement
     *
     * This function allows for a plugin to send a stream to another plugin
     */
  }
}
