import {
  DynamicallyReferencedMethodBase,
  DynamicallyReferencedMethodType,
} from "@bettercorp/tools/lib/Interfaces";
import { Readable } from "stream";

export type DynamicallyReferencedMethodOnIEvents<
  Interface extends DynamicallyReferencedMethodBase,
  Method extends string,
  hasReturnable extends boolean = false
> = Interface[Method] extends (...a: infer Arguments) => infer Return
  ? [
      event: Method,
      listener: {
        (...a: Arguments): hasReturnable extends true ? Return : Promise<void>;
      }
    ]
  : [event: Method, noMatchingEvent: never];

export type DynamicallyReferencedMethodEmitIEvents<
  Interface extends DynamicallyReferencedMethodBase,
  Method extends string
> = Interface[Method] extends (...a: infer Arguments) => infer Return
  ? [event: Method, ...a: Arguments]
  : [noMatchingEvent: never];

export type DynamicallyReferencedMethodEmitEARIEvents<
  Interface extends DynamicallyReferencedMethodBase,
  Method extends string,
  ArgsReference extends boolean = true,
  ShowTimeout extends boolean = true
> = ArgsReference extends true
  ? Interface[Method] extends (...a: infer Arguments) => infer Return
    ? ShowTimeout extends true
      ? [event: Method, timeoutSeconds?: number, ...a: Arguments]
      : [event: Method, ...a: Arguments]
    : [event: Method, noMatchingEvent: never]
  : Interface[Method] extends (...a: infer Arguments) => infer Return
  ? Return extends Promise<unknown>
    ? Return
    : Promise<Return>
  : Promise<never>;

export interface IServiceEvents<
  onEvents,
  emitEvents,
  onReturnableEvents,
  emitReturnableEvents,
  onBroadcast,
  emitBroadcast
> {
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
      DynamicallyReferencedMethodType<onBroadcast>,
      TA,
      false
    >
  ): Promise<void>;
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
      DynamicallyReferencedMethodType<emitBroadcast>,
      TA
    >
  ): Promise<void>;

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
   *   /// Do something with the data
   * });
   */
  onEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodOnIEvents<
      DynamicallyReferencedMethodType<onEvents>,
      TA,
      false
    >
  ): Promise<void>;
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
   *   /// Do something with the data
   * });
   */
  emitEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodEmitIEvents<
      DynamicallyReferencedMethodType<emitEvents>,
      TA
    >
  ): Promise<void>;

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
      DynamicallyReferencedMethodType<onEvents>,
      TA,
      false
    >
  ): Promise<void>;
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
      DynamicallyReferencedMethodType<emitEvents>,
      TA
    >
  ): Promise<void>;

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
      DynamicallyReferencedMethodType<onReturnableEvents>,
      TA,
      true
    >
  ): Promise<void>;
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
      DynamicallyReferencedMethodType<emitReturnableEvents>,
      TA,
      true,
      false
    >
  ): DynamicallyReferencedMethodEmitEARIEvents<
    DynamicallyReferencedMethodType<onReturnableEvents>,
    TA,
    false
  >;

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
      DynamicallyReferencedMethodType<onReturnableEvents>,
      TA,
      true
    >
  ): Promise<void>;
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
      DynamicallyReferencedMethodType<emitReturnableEvents>,
      TA,
      true,
      false
    >
  ): DynamicallyReferencedMethodEmitEARIEvents<
    DynamicallyReferencedMethodType<onReturnableEvents>,
    TA,
    false
  >;

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
      DynamicallyReferencedMethodType<emitReturnableEvents>,
      TA,
      true,
      true
    >
  ): DynamicallyReferencedMethodEmitEARIEvents<
    DynamicallyReferencedMethodType<onReturnableEvents>,
    TA,
    false
  >;
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
      DynamicallyReferencedMethodType<emitReturnableEvents>,
      TA,
      true,
      true
    >
  ): DynamicallyReferencedMethodEmitEARIEvents<
    DynamicallyReferencedMethodType<onReturnableEvents>,
    TA,
    false
  >;

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
    listener: { (error: Error | null, stream: Readable): Promise<void> },
    timeoutSeconds?: number
  ): Promise<string>;

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
  sendStream(streamId: string, stream: Readable): Promise<void>;
}
