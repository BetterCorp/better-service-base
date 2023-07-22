import {
  DynamicallyReferencedMethodEmitEARIEvents,
  DynamicallyReferencedMethodEmitIEvents,
  DynamicallyReferencedMethodOnIEvents,
  IServiceEvents,
} from "../interfaces/events";
import { ServicesBase } from "./service";
import { Readable } from "stream";
import { IPluginConfig } from "../interfaces/config";
import { DefaultBase } from "../interfaces/base";
import { ErrorMessages } from "../interfaces/static";
import {
  DynamicallyReferencedMethod,
  DynamicallyReferencedMethodType,
} from "@bettercorp/tools/lib/Interfaces";
import {
  ServiceEvents,
  ServiceReturnableEvents,
  ServiceCallable,
  ServiceBroadcasts,
} from "./base";
import { Tools } from '@bettercorp/tools';

export class RegisteredPlugin<
    onEvents,
    emitEvents,
    onReturnableEvents,
    emitReturnableEvents,
    callableMethods,
    PluginConfigType extends IPluginConfig,
    onBroadcast,
    emitBroadcast
  >
  extends DefaultBase<PluginConfigType>
  implements
    IServiceEvents<
      emitEvents,
      onEvents,
      emitReturnableEvents,
      onReturnableEvents,
      emitBroadcast,
      onBroadcast
    >
{
  /**
   * Gets a stream ID for another plugin to stream data to it.
   * 
   * @param listener - Function that is called when the stream is received
   * @param timeoutSeconds - How long to wait for the stream to be fully received before timing out
   * @returns The stream ID that the other plugin should use to stream data to this plugin
   * 
   * @example
   * Basic example of using streams
   * ```ts
   * /// Plugin that receives a stream
   * let streamId = await this.receiveStream(
   *  async (err: Error | null, stream: Readable) => {
   *    pipeline(stream, fs.createWriteStream('./fileout.txt'), (errf) => {
   *      if (errf) throw errf;
   *    });
   *  },
   *   5 // seconds
   * );
   * /// Send stream ID to other plugin
   * /// you can use emitEventAndReturn to send the stream ID to the other plugin and await for the stream to finish
   * 
   * /// Plugin that sends a stream
   * /// This would listen to the event that the other plugin emits
   * await this.sendStream(streamId, fs.createReadStream('./filein.txt'));
   * /// and then returns OK to the other plugin
   * ```
   */
  receiveStream(
    listener: (error: Error | null, stream: Readable) => Promise<void>,
    timeoutSeconds?: number
  ): Promise<string> {
    throw ErrorMessages.BSBNotInit;
  }
  /**
   * Sends a stream to another plugin
   * 
   * @param streamId - The stream ID to stream data too
   * @param stream - The stream to send
   * @returns Promise that resolves when the stream has been fully sent
   * 
   * @example
   * Basic example of using streams
   * ```ts
   * /// Plugin that receives a stream
   * let streamId = await this.receiveStream(
   *  async (err: Error | null, stream: Readable) => {
   *    pipeline(stream, fs.createWriteStream('./fileout.txt'), (errf) => {
   *      if (errf) throw errf;
   *    });
   *  },
   *   5 // seconds
   * );
   * /// Send stream ID to other plugin
   * /// you can use emitEventAndReturn to send the stream ID to the other plugin and await for the stream to finish
   * 
   * /// Plugin that sends a stream
   * /// This would listen to the event that the other plugin emits
   * await this.sendStream(streamId, fs.createReadStream('./filein.txt'));
   * /// and then returns OK to the other plugin
   * ```
   */
  sendStream(streamId: string, stream: Readable): Promise<void> {
    throw ErrorMessages.BSBNotInit;
  }

  /**
   * Listens for events that are emitted by other plugins
   * Broadcast events are emitted and received by all plugins
   * 
   * @param event - The event to listen for
   * @param listener - The function to call when the event is received
   * @returns Promise that resolves when the event listener has been registered
   * 
   * @example
   * Basic example of using broadcast events
   * ```ts
   * /// Plugin that emits a broadcast event
   * await this.emitBroadcast('myEvent', 'some', 'data'); // This will be typesafe
   * 
   * /// Plugin that receives a broadcast event
   * await this.onBroadcast('myEvent', async (some: string, data: string) => {
   *   /// Do something with the data
   * });
   * ```
   */
  onBroadcast<TA extends string>(
    ...args: DynamicallyReferencedMethodOnIEvents<
      DynamicallyReferencedMethodType<emitBroadcast>,
      TA,
      false
    >
  ): Promise<void> {
    throw ErrorMessages.BSBNotInit;
  }
  /**
   * Emits a broadcast event that is received by all plugins that are listening for that event
   * 
   * @param event - The event to emit
   * @param args - The arguments to pass to the event
   * @returns Promise that resolves when the event has been emitted
   * 
   * @example
   * Basic example of using broadcast events
   * ```ts
   * /// Plugin that emits a broadcast event
   * await this.emitBroadcast('myEvent', 'some', 'data'); // This will be typesafe
   * 
   * /// Plugin that receives a broadcast event
   * await this.onBroadcast('myEvent', async (some: string, data: string) => {
   *   /// Do something with the data
   * });
   */
  emitBroadcast<TA extends string>(
    ...args: DynamicallyReferencedMethodEmitIEvents<
      DynamicallyReferencedMethodType<onBroadcast>,
      TA
    >
  ): Promise<void> {
    throw ErrorMessages.BSBNotInit;
  }

  /**
   * Listens for events that are emitted by other plugins (the first plugin to receive the event will handle it)
   * 
   * @param event - The event to listen for
   * @param listener - The function to call when the event is received
   * @returns Promise that resolves when the event listener has been registered
   * 
   * @example
   * Basic example of using events
   * ```ts
   * /// Plugin that emits an event
   * await this.emitEvent('myEvent', 'some', 'data'); // This will be typesafe
   * 
   * /// Plugin that receives an event
   * await this.onEvent('myEvent', async (some: string, data: string) => {
   *  /// Do something with the data
   * });
   */
  onEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodOnIEvents<
      DynamicallyReferencedMethodType<emitEvents>,
      TA,
      false
    >
  ): Promise<void> {
    throw ErrorMessages.BSBNotInit;
  }

  /**
   * Emits an event that is received by the first plugin that is listening for that event (depends on events service)
   * 
   * @param event - The event to emit
   * @param args - The arguments to pass to the event
   * @returns Promise that resolves when the event has been emitted
   * 
   * @example
   * Basic example of using events
   * ```ts
   * /// Plugin that emits an event
   * await this.emitEvent('myEvent', 'some', 'data'); // This will be typesafe
   * 
   * /// Plugin that receives an event
   * await this.onEvent('myEvent', async (some: string, data: string) => {
   *  /// Do something with the data
   * });
   */
  emitEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodEmitIEvents<
      DynamicallyReferencedMethodType<onEvents>,
      TA
    >
  ): Promise<void> {
    throw ErrorMessages.BSBNotInit;
  }

  /**
   * Listens for events that are emitted by other plugins (the first plugin to receive the event will handle it)
   * The serverId allows for the event to be handled by a specific plugin
   *
   * @param serverId - The server ID to listen for the event on
   * @param event - The event to listen for
   * @param listener - The function to call when the event is received
   * @returns Promise that resolves when the event listener has been registered
   *
   * @example
   * Basic example of using events
   * ```ts
   * /// Plugin that emits an event
   * await this.emitEventSpecific('serverId', 'myEvent', 'some', 'data'); // This will be typesafe
   *
   * /// Plugin that receives an event
   * await this.onEventSpecific('serverId', 'myEvent', async (some: string, data: string) => {
   *   /// Do something with the data
   * });
   */
  onEventSpecific<TA extends string>(
    serverId: string,
    ...args: DynamicallyReferencedMethodOnIEvents<
      DynamicallyReferencedMethodType<emitEvents>,
      TA,
      false
    >
  ): Promise<void> {
    throw ErrorMessages.BSBNotInit;
  }
  /**
   * Emits an event that is received by the first plugin that is listening for that event (depends on events service)
   * The serverId allows for the event to be handled by a specific plugin
   *
   * @param serverId - The server ID to emit the event on
   * @param event - The event to emit
   * @param args - The arguments to pass to the event
   * @returns Promise that resolves when the event has been emitted
   *
   * @example
   * Basic example of using events
   * ```ts
   * /// Plugin that emits an event
   * await this.emitEventSpecific('serverId', 'myEvent', 'some', 'data'); // This will be typesafe
   *
   * /// Plugin that receives an event
   * await this.onEventSpecific('serverId', 'myEvent', async (some: string, data: string) => {
   *   /// Do something with the data
   * });
   */
  emitEventSpecific<TA extends string>(
    serverId: string,
    ...args: DynamicallyReferencedMethodEmitIEvents<
      DynamicallyReferencedMethodType<onEvents>,
      TA
    >
  ): Promise<void> {
    throw ErrorMessages.BSBNotInit;
  }
  /**
   * Listens for events and retuns a value to the plugin that emitted the event
   *
   * @param event - The event to listen for
   * @param listener - The function to call when the event is received
   *  - @returns The value to return to the plugin that emitted the event
   * @returns Promise that resolves when the event listener has been registered
   *
   * @example
   * Basic example of using returnable events
   * ```ts
   * /// Plugin that emits a returnable event
   * let result = await this.emitEventAndReturn('myEvent', 'some', 'data'); // This will be typesafe
   *
   * /// Plugin that receives a returnable event
   * await this.onReturnableEvent('myEvent', async (some: string, data: string) => {
   *   /// Do something with the data
   *   return 'some result';
   * });
   */
  onReturnableEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodOnIEvents<
      DynamicallyReferencedMethodType<emitReturnableEvents>,
      TA,
      true
    >
  ): Promise<void> {
    throw ErrorMessages.BSBNotInit;
  }
  /**
   * Listens for events and retuns a value to the plugin that emitted the event
   * The serverId allows for the event to be handled by a specific plugin
   *
   * @param serverId - The server ID to listen for the event on
   * @param event - The event to listen for
   * @param listener - The function to call when the event is received
   * @returns Promise that resolves when the event listener has been registered
   *
   * @example
   * Basic example of using returnable events
   * ```ts
   * /// Plugin that emits a returnable event
   * let result = await this.emitEventAndReturnSpecific('serverId', 'myEvent', 'some', 'data'); // This will be typesafe
   *
   * /// Plugin that receives a returnable event
   * await this.onReturnableEventSpecific('serverId', 'myEvent', async (some: string, data: string) => {
   *   /// Do something with the data
   *   return 'some result';
   * });
   */
  onReturnableEventSpecific<TA extends string>(
    serverId: string,
    ...args: DynamicallyReferencedMethodOnIEvents<
      DynamicallyReferencedMethodType<emitReturnableEvents>,
      TA,
      true
    >
  ): Promise<void> {
    throw ErrorMessages.BSBNotInit;
  }
  /**
   * Emits a returnable event that is received by the first plugin that is listening for that event (depends on events service)
   *
   * @param event - The event listen to
   * @param args - The arguments to pass to the event
   * @returns Promise that resolves when the event has been emitted and the value has been returned
   *
   * @example
   * Basic example of using returnable events
   * ```ts
   * /// Plugin that emits a returnable event
   * let result = await this.emitEventAndReturn('myEvent', 'some', 'data'); // This will be typesafe
   *
   * /// Plugin that receives a returnable event
   * await this.onReturnableEvent('myEvent', async (some: string, data: string) => {
   *   /// Do something with the data
   *   return 'some result';
   * });
   */
  emitEventAndReturn<TA extends string>(
    ...args: DynamicallyReferencedMethodEmitEARIEvents<
      DynamicallyReferencedMethodType<onReturnableEvents>,
      TA,
      true,
      false
    >
  ): DynamicallyReferencedMethodEmitEARIEvents<
    DynamicallyReferencedMethodType<emitReturnableEvents>,
    TA,
    false
  > {
    throw ErrorMessages.BSBNotInit;
  }
  /**
   * Emits a returnable event that is received by the first plugin that is listening for that event (depends on events service)
   * The serverId allows for the event to be handled by a specific plugin
   *
   * @param serverId - The server ID to emit the event on
   * @param event - The event emit
   * @param args - The arguments to pass to the event
   * @returns Promise that resolves when the event has been emitted and the value has been returned
   *
   * @example
   * Basic example of using returnable events
   * ```ts
   * /// Plugin that emits a returnable event
   * let result = await this.emitEventAndReturnSpecific('serverId', 'myEvent', 'some', 'data'); // This will be typesafe
   *
   * /// Plugin that receives a returnable event
   * await this.onReturnableEventSpecific('serverId', 'myEvent', async (some: string, data: string) => {
   *   /// Do something with the data
   *   return 'some result';
   * });
   */
  emitEventAndReturnSpecific<TA extends string>(
    serverId: string,
    ...args: DynamicallyReferencedMethodEmitEARIEvents<
      DynamicallyReferencedMethodType<onReturnableEvents>,
      TA,
      true,
      false
    >
  ): DynamicallyReferencedMethodEmitEARIEvents<
    DynamicallyReferencedMethodType<emitReturnableEvents>,
    TA,
    false
  > {
    throw ErrorMessages.BSBNotInit;
  }
  /**
   * Emits a returnable event with a custom timeout.
   *
   * @param event - The event to emit
   * @param timeoutSeconds - How long to wait for the event to be received before timing out
   * @param args - The arguments to pass to the event
   * @returns Promise that resolves when the event has been emitted and the value has been returned
   * 
   * @example
   * Basic example of using returnable events with timeouts
   * ```ts
   * /// Plugin that emits a returnable event
   * let result = await this.emitEventAndReturnTimed('myEvent', 5, 'some', 'data'); // This will be typesafe
   * /// This will wait 5 seconds for the event to be received before timing out
   * /// If the event is not received within 5 seconds, the promise will reject
   * 
   * /// Plugin that receives a returnable event
   * await this.onReturnableEvent('myEvent', async (some: string, data: string) => {
   *  /// Do something with the data
   *  return 'some result';
   * });
   */ 
  emitEventAndReturnTimed<TA extends string>(
    ...args: DynamicallyReferencedMethodEmitEARIEvents<
      DynamicallyReferencedMethodType<onReturnableEvents>,
      TA,
      true,
      true
    >
  ): DynamicallyReferencedMethodEmitEARIEvents<
    DynamicallyReferencedMethodType<emitReturnableEvents>,
    TA,
    false
  > {
    throw ErrorMessages.BSBNotInit;
  }
  /**
   * Emits a returnable event with a specific serverId and a custom timeout.
   * 
   * @param serverId - The server ID to emit the event on
   * @param event - The event to emit
   * @param timeoutSeconds - How long to wait for the event to be received before timing out
   * @param args - The arguments to pass to the event
   * @returns Promise that resolves when the event has been emitted and the value has been returned
   * 
   * @example
   * Basic example of using returnable events with timeouts
   * ```ts
   * /// Plugin that emits a returnable event
   * 
   * let result = await this.emitEventAndReturnTimedSpecific('serverId', 'myEvent', 5, 'some', 'data'); // This will be typesafe
   * /// This will wait 5 seconds for the event to be received before timing out
   * /// If the event is not received within 5 seconds, the promise will reject
   * 
   * /// Plugin that receives a returnable event
   * await this.onReturnableEventSpecific('serverId', 'myEvent', async (some: string, data: string) => {
   *   /// Do something with the data
   *   return 'some result';
   * });
   */
  emitEventAndReturnTimedSpecific<TA extends string>(
    serverId: string,
    ...args: DynamicallyReferencedMethodEmitEARIEvents<
      DynamicallyReferencedMethodType<onReturnableEvents>,
      TA,
      true,
      true
    >
  ): DynamicallyReferencedMethodEmitEARIEvents<
    DynamicallyReferencedMethodType<emitReturnableEvents>,
    TA,
    false
  > {
    throw ErrorMessages.BSBNotInit;
  }
  /**
   * Calls a method on another plugin
   * 
   * @param method - The method to call
   * @param args - The arguments to pass to the method
   * @returns Promise that resolves when the method has been called
   * 
   * @example
   * Basic example of using callable methods
   * ```ts
   * /// Plugin that calls a method
   * await this.callPluginMethod('myMethod', 'some', 'data'); // This will be typesafe
   */
  callPluginMethod<TA extends string>(
    ...args: DynamicallyReferencedMethod<
      DynamicallyReferencedMethodType<callableMethods>,
      TA
    >
  ): DynamicallyReferencedMethod<
    DynamicallyReferencedMethodType<callableMethods>,
    TA,
    false
  > {
    throw ErrorMessages.BSBNotInit;
  }
}

export class ServicesClient<
  onEvents = ServiceEvents,
  emitEvents = ServiceEvents,
  onReturnableEvents = ServiceReturnableEvents,
  emitReturnableEvents = ServiceReturnableEvents,
  callableMethods = ServiceCallable,
  onBroadcast = ServiceBroadcasts,
  emitBroadcast = ServiceBroadcasts
> {
  public readonly pluginName!: string;
  public readonly initBeforePlugins?: Array<string>;
  public readonly initAfterPlugins?: Array<string>;
  public readonly runBeforePlugins?: Array<string>;
  public readonly runAfterPlugins?: Array<string>;

  private _referencedPlugin: ServicesBase<any, any, any, any>;
  protected _plugin!: RegisteredPlugin<
    onEvents,
    emitEvents,
    onReturnableEvents,
    emitReturnableEvents,
    callableMethods,
    any,
    onBroadcast,
    emitBroadcast
  >;

  public async _init(): Promise<void> {
    if (!Tools.isString(this.pluginName) || this.pluginName === "") {
      throw 'pluginName is not set in this client. Please update the clients definition '
    }

    // We must add the inits/runs list to the referenced service in order to change the init and run order
    (this._referencedPlugin as any).initBeforePlugins = (
      this._referencedPlugin.initBeforePlugins || []
    ).concat(this.initBeforePlugins || []);
    (this._referencedPlugin as any).initAfterPlugins = (
      this._referencedPlugin.initAfterPlugins || []
    ).concat(this.initAfterPlugins || []);
    (this._referencedPlugin as any).runBeforePlugins = (
      this._referencedPlugin.runBeforePlugins || []
    ).concat(this.runBeforePlugins || []);
    (this._referencedPlugin as any).runAfterPlugins = (
      this._referencedPlugin.runAfterPlugins || []
    ).concat(this.runAfterPlugins || []);

    if (this._plugin === undefined) {
      this._plugin = await this._referencedPlugin.initPluginClient<
        onEvents,
        emitEvents,
        onReturnableEvents,
        emitReturnableEvents,
        callableMethods,
        any,
        onBroadcast,
        emitBroadcast
      >(this.pluginName);
    }
  }
  
  public async init(): Promise<void> {
  }

  constructor(self: ServicesBase<any, any, any>) {
    this._referencedPlugin = self;
    (self as any)._clients.push(this);
  }
}
