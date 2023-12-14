import { Readable } from "stream";
import {
  DynamicallyReferencedMethodEmitEARIEvents,
  DynamicallyReferencedMethodEmitIEvents,
  DynamicallyReferencedMethodOnIEvents,
} from "../interfaces/events";
import { ServiceEventsBase } from "../interfaces/service";
import { DEBUG_MODE } from "../interfaces/logging";
import { DynamicallyReferencedMethodType } from "@bettercorp/tools/lib/Interfaces";
import { SBEvents } from "../serviceBase/events";
import { BSBService } from "./service";
import { BSBServiceClient } from "./serviceClient";

export class PluginEvents<
  onEvents = ServiceEventsBase,
  emitEvents = ServiceEventsBase,
  onReturnableEvents = ServiceEventsBase,
  emitReturnableEvents = ServiceEventsBase,
  onBroadcast = ServiceEventsBase,
  emitBroadcast = ServiceEventsBase
> {
  private events: SBEvents;
  private service: BSBService | BSBServiceClient<any>;
  constructor(
    mode: DEBUG_MODE,
    events: SBEvents,
    context: BSBService<any, any> | BSBServiceClient<any>
  ) {
    this.events = events;
    this.service = context;
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
  public async onBroadcast<TA extends string>(
    ...args: DynamicallyReferencedMethodOnIEvents<
      DynamicallyReferencedMethodType<onBroadcast>,
      TA,
      false
    >
  ): Promise<void> {
    const event = args.splice(0, 1)[0] as string;
    await this.events.onBroadcast(
      this.service,
      this.service.pluginName,
      event,
      args[0] as unknown as (...args: any[]) => void | Promise<void>
    );
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
  async emitBroadcast<TA extends string>(
    ...args: DynamicallyReferencedMethodEmitIEvents<
      DynamicallyReferencedMethodType<emitBroadcast>,
      TA
    >
  ): Promise<void> {
    const event = args.splice(0, 1)[0] as string;
    await this.events.emitBroadcast(this.service.pluginName, event, ...args);
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
   *   /// Do something with the data
   * });
   */
  public async onEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodOnIEvents<
      DynamicallyReferencedMethodType<onEvents>,
      TA,
      false
    >
  ): Promise<void> {
    const event = args.splice(0, 1)[0] as string;
    await this.events.onEvent(
      this.service,
      this.service.pluginName,
      event,
      args[0] as unknown as (...args: any[]) => void | Promise<void>
    );
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
   *   /// Do something with the data
   * });
   */
  public async emitEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodEmitIEvents<
      DynamicallyReferencedMethodType<emitEvents>,
      TA
    >
  ): Promise<void> {
    const event = args.splice(0, 1)[0] as string;
    await this.events.emitEvent(this.service.pluginName, event, ...args);
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
  public async onEventSpecific<TA extends string>(
    serverId: string,
    ...args: DynamicallyReferencedMethodOnIEvents<
      DynamicallyReferencedMethodType<onEvents>,
      TA,
      false
    >
  ): Promise<void> {
    const event = args.splice(0, 1)[0] as string;
    await this.events.onEventSpecific(
      serverId,
      this.service,
      this.service.pluginName,
      event,
      args[0] as unknown as (...args: any[]) => void | Promise<void>
    );
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
  public async emitEventSpecific<TA extends string>(
    serverId: string,
    ...args: DynamicallyReferencedMethodEmitIEvents<
      DynamicallyReferencedMethodType<emitEvents>,
      TA
    >
  ): Promise<void> {
    const event = args.splice(0, 1)[0] as string;
    await this.events.emitEventSpecific(
      serverId,
      this.service.pluginName,
      event,
      ...args
    );
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
  public async onReturnableEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodOnIEvents<
      DynamicallyReferencedMethodType<onReturnableEvents>,
      TA,
      true
    >
  ): Promise<void> {
    const event = args.splice(0, 1)[0] as string;
    return await this.events.onReturnableEvent(
      this.service,
      this.service.pluginName,
      event,
      args[0] as unknown as (...args: any[]) => void | Promise<void>
    );
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
  public async emitEventAndReturn<TA extends string>(
    ...args: DynamicallyReferencedMethodEmitEARIEvents<
      DynamicallyReferencedMethodType<emitReturnableEvents>,
      TA,
      true //,
      //false
    >
  ): Promise<
    DynamicallyReferencedMethodEmitEARIEvents<
      DynamicallyReferencedMethodType<onReturnableEvents>,
      TA,
      false
    >
  > {
    const event = args.splice(0, 1)[0] as string;
    const timeoutSeconds =
      args.length > 0 ? (args.splice(0, 1)[0] as number) : 5;
    return await this.events.emitEventAndReturn(
      this.service.pluginName,
      event,
      timeoutSeconds,
      ...args
    );
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
  public async onReturnableEventSpecific<TA extends string>(
    serverId: string,
    ...args: DynamicallyReferencedMethodOnIEvents<
      DynamicallyReferencedMethodType<onReturnableEvents>,
      TA,
      true
    >
  ): Promise<void> {
    const event = args.splice(0, 1)[0] as string;
    return await this.events.onReturnableEventSpecific(
      serverId,
      this.service,
      this.service.pluginName,
      event,
      args[0] as unknown as (...args: any[]) => void | Promise<void>
    );
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
  public async emitEventAndReturnSpecific<TA extends string>(
    serverId: string,
    ...args: DynamicallyReferencedMethodEmitEARIEvents<
      DynamicallyReferencedMethodType<emitReturnableEvents>,
      TA,
      true /*,
      false*/
    >
  ): Promise<
    DynamicallyReferencedMethodEmitEARIEvents<
      DynamicallyReferencedMethodType<onReturnableEvents>,
      TA,
      false
    >
  > {
    const event = args.splice(0, 1)[0] as string;
    const timeoutSeconds =
      args.length > 0 ? (args.splice(0, 1)[0] as number) : 5;
    return await this.events.emitEventAndReturnSpecific(
      serverId,
      this.service.pluginName,
      event,
      timeoutSeconds,
      ...args
    );
  }

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
  public async receiveStream(
    event: string,
    listener: { (error: Error | null, stream: Readable): Promise<void> },
    timeoutSeconds?: number
  ): Promise<string> {
    return await this.events.receiveStream(
      this.service,
      this.service.pluginName,
      event,
      listener,
      timeoutSeconds
    );
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
  public async sendStream(
    event: string,
    streamId: string,
    stream: Readable
  ): Promise<void> {
    return await this.events.sendStream(
      this.service.pluginName,
      event,
      streamId,
      stream
    );
  }
}
