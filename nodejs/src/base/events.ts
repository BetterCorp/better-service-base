/* eslint-disable @typescript-eslint/no-unused-vars */
import { Readable } from "stream";
import { BSBConfigDefinition, BaseWithLoggingAndConfig } from "./base";
import { BSB_ERROR_METHOD_NOT_IMPLEMENTED } from "./errorMessages";
import { DEBUG_MODE } from "../interfaces";
import { SBLogging } from "../serviceBase";

export interface BSBEventsConstructor {
  appId: string;
  mode: DEBUG_MODE;
  pluginName: string;
  cwd: string;
  pluginCwd: string;
  config: any;
  sbLogging: SBLogging;
}

export abstract class BSBEvents<
  PluginConfigType extends BSBConfigDefinition = any
> extends BaseWithLoggingAndConfig<PluginConfigType> {
  constructor(config: BSBEventsConstructor) {
    super(
      config.appId,
      config.mode,
      config.pluginName,
      config.cwd,
      config.pluginCwd,
      config.config,
      config.sbLogging
    );
  }

  /**
   * This function is never used for events plugins.
   * @ignore @deprecated
   */
  public run() {}

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
  public abstract onBroadcast(
    pluginName: string,
    event: string,
    listener: { (args: Array<any>): Promise<void> }
  ): Promise<void>;

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
  public abstract emitBroadcast(
    pluginName: string,
    event: string,
    args: Array<any>
  ): Promise<void>;

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
  public abstract onEvent(
    pluginName: string,
    event: string,
    listener: { (args: Array<any>): Promise<void> }
  ): Promise<void>;

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
  public abstract emitEvent(
    pluginName: string,
    event: string,
    args: Array<any>
  ): Promise<void>;

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
  public abstract onReturnableEvent(
    pluginName: string,
    event: string,
    listener: { (args: Array<any>): Promise<any> }
  ): Promise<void>;

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
  public abstract emitEventAndReturn(
    pluginName: string,
    event: string,
    timeoutSeconds: number,
    args: Array<any>
  ): Promise<any>;

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
  public abstract receiveStream(
    event: string,
    listener: (error: Error | null, stream: Readable) => Promise<void>,
    timeoutSeconds?: number
  ): Promise<string>;

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
  public abstract sendStream(
    event: string,
    streamId: string,
    stream: Readable
  ): Promise<void>;
}

/**
 * DO NOT REFERENCE/USE THIS CLASS - IT IS AN INTERNALLY REFERENCED CLASS
 */
export class BSBEventsRef extends BSBEvents {
  public onBroadcast(
    pluginName: string,
    event: string,
    listener: (args: any[]) => Promise<void>
  ): Promise<void> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "onBroadcast");
  }
  public emitBroadcast(
    pluginName: string,
    event: string,
    args: any[]
  ): Promise<void> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "emitBroadcast");
  }
  public onEvent(
    pluginName: string,
    event: string,
    listener: (args: any[]) => Promise<void>
  ): Promise<void> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "onEvent");
  }
  public emitEvent(
    pluginName: string,
    event: string,
    args: any[]
  ): Promise<void> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "emitEvent");
  }
  public onReturnableEvent(
    pluginName: string,
    event: string,
    listener: (args: any[]) => Promise<any>
  ): Promise<void> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "onReturnableEvent");
  }
  public emitEventAndReturn(
    pluginName: string,
    event: string,
    timeoutSeconds: number,
    args: any[]
  ): Promise<any> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED(
      "BSBEventsRef",
      "emitEventAndReturn"
    );
  }
  public receiveStream(
    event: string,
    listener: (error: Error | null, stream: Readable) => Promise<void>,
    timeoutSeconds?: number | undefined
  ): Promise<string> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "receiveStream");
  }
  public sendStream(
    event: string,
    streamId: string,
    stream: Readable
  ): Promise<void> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "sendStream");
  }
  dispose?(): void;
  init?(): void | Promise<void>;
}
