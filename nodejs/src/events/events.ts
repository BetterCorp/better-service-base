import { IPluginLogger } from "../interfaces/logger";
import { Readable } from "stream";
import { IPluginConfig } from "../interfaces/config";
import { DefaultBase } from "../interfaces/base";
import { ErrorMessages } from "../interfaces/static";

export class EventsBase<
  PluginConfigType extends IPluginConfig = any
> extends DefaultBase<PluginConfigType> {
  constructor(
    pluginName: string,
    cwd: string,
    pluginCwd: string,
    log: IPluginLogger
  ) {
    super(pluginName, cwd, pluginCwd, log);
  }
  /**
   * Listens for events that are emitted by other plugins
   * Broadcast events are emitted and received by all plugins
   *
   * @param callerPluginName - The name of the plugin that is calling this function
   * @param pluginName - The name of the plugin that is being listened to
   * @param event - The event to listen for
   * @param listener - The function to call when the event is received
   * @returns Promise that resolves when the event listener has been registered
   *
   * @see BSB events-default plugin for an example of how to use this function
   * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/events-default | Default Events Plugin}
   */
  public async onBroadcast(
    callerPluginName: string,
    pluginName: string,
    event: string,
    listener: { (args: Array<any>): Promise<void> }
  ): Promise<void> {
    throw ErrorMessages.EventsNotImplementedProperly;
  }
  /**
   * Emits an event that is received by all plugins
   *
   * @param callerPluginName - The name of the plugin that is calling this function
   * @param pluginName - The name of the plugin that is emitting the event
   * @param event - The event to emit
   * @param args - The arguments to pass to the event listener
   * @returns Promise that resolves when the event has been emitted
   *
   * @see BSB events-default plugin for an example of how to use this function
   * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/events-default | Default Events Plugin}
   */
  public async emitBroadcast(
    callerPluginName: string,
    pluginName: string,
    event: string,
    args: Array<any>
  ): Promise<void> {
    throw ErrorMessages.EventsNotImplementedProperly;
  }

  /**
   * Listens for events that are emitted by other plugins
   * Events are emitted and received by a single plugin
   * Make sure to use the built in tests
   *
   * @param callerPluginName - The name of the plugin that is calling this function
   * @param pluginName - The name of the plugin that is being listened to
   * @param event - The event to listen for
   * @param listener - The function to call when the event is received
   * @returns Promise that resolves when the event listener has been registered
   *
   * @see BSB events-default plugin for an example of how to use this function
   * @see {@link  https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/events-default | Default Events Plugin}
   */
  public async onEvent(
    callerPluginName: string,
    pluginName: string,
    event: string,
    listener: { (args: Array<any>): Promise<void> }
  ): Promise<void> {
    throw ErrorMessages.EventsNotImplementedProperly;
  }
  /**
   * Emits an event that is received by a single plugin
   * Make sure to use the built in tests
   *
   * @param callerPluginName - The name of the plugin that is calling this function
   * @param pluginName - The name of the plugin that is emitting the event
   * @param event - The event to emit
   * @param args - The arguments to pass to the event listener
   * @returns Promise that resolves when the event has been emitted
   *
   * @see BSB events-default plugin for an example of how to use this function
   * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/events-default | Default Events Plugin}
   */
  public async emitEvent(
    callerPluginName: string,
    pluginName: string,
    event: string,
    args: Array<any>
  ): Promise<void> {
    throw ErrorMessages.EventsNotImplementedProperly;
  }

  /**
   * Listens for events that are emitted by other plugins and return a value
   * Events are emitted and received by a single plugin
   * Make sure to use the built in tests
   *
   * @param callerPluginName - The name of the plugin that is calling this function
   * @param pluginName - The name of the plugin that is being listened to
   * @param event - The event to listen for
   * @param listener - The function to call when the event is received
   * @returns Promise that resolves when the event listener has been registered
   *
   * @see BSB events-default plugin for an example of how to use this function
   * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/events-default | Default Events Plugin}
   */
  public async onReturnableEvent(
    callerPluginName: string,
    pluginName: string,
    event: string,
    listener: { (args: Array<any>): Promise<any> }
  ): Promise<void> {
    throw ErrorMessages.EventsNotImplementedProperly;
  }
  /**
   * Emits an event that is received by a single plugin and returns a value
   * Make sure to use the built in tests
   *
   * @param callerPluginName - The name of the plugin that is calling this function
   * @param pluginName - The name of the plugin that is emitting the event
   * @param event - The event to emit
   * @param timeoutSeconds - The number of seconds to wait for the value to be returned
   * @param args - The arguments to pass to the event listener
   * @returns Promise that resolves when the event has been emitted and the value has been returned
   *
   * @see BSB events-default plugin for an example of how to use this function
   * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/events-default | Default Events Plugin}
   */
  public async emitEventAndReturn(
    callerPluginName: string,
    pluginName: string,
    event: string,
    timeoutSeconds: number,
    args: Array<any>
  ): Promise<any> {
    throw ErrorMessages.EventsNotImplementedProperly;
  }

  /**
   * Sets up a receive stream to receive a stream from another plugin
   *
   * @param callerPluginName - The name of the plugin that is calling this function
   * @param listener - The function to call when the stream is received
   * @param timeoutSeconds - The number of seconds to wait for the stream to be received
   * @returns Promise that resolves with the stream id that can be used to stream data to the listener
   *
   * @see BSB events-default plugin for an example of how to use this function
   * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/events-default | Default Events Plugin}
   */
  public async receiveStream(
    callerPluginName: string,
    listener: (error: Error | null, stream: Readable) => Promise<void>,
    timeoutSeconds?: number
  ): Promise<string> {
    throw ErrorMessages.EventsNotImplementedProperly;
  }
  /**
   * Sets up a send stream to send a stream to another plugin that created a receive stream
   *
   * @param callerPluginName - The name of the plugin that is calling this function
   * @param streamId - The id of the stream to send data to
   * @param stream - The stream to send data from
   * @returns Promise that resolves when the stream has been sent
   *
   * @see BSB events-default plugin for an example of how to use this function
   * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/events-default | Default Events Plugin}
   */
  sendStream(
    callerPluginName: string,
    streamId: string,
    stream: Readable
  ): Promise<void> {
    throw ErrorMessages.EventsNotImplementedProperly;
  }
}
