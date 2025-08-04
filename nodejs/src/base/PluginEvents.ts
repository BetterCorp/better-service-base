/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.  
 * Copyright (C) 2016 - 2025 BetterCorp (PTY) Ltd  
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Alternatively, you may obtain a commercial license for this program. 
 * The commercial license allows you to use the Program in a closed-source manner, 
 * including the right to create derivative works that are not subject to the terms 
 * of the AGPL. 
 *
 * To obtain a commercial license, please contact the copyright holders at 
 * https://www.bettercorp.dev. The terms and conditions of the commercial license 
 * will be provided upon request.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { Readable } from "node:stream";
import {
    DEBUG_MODE, DTrace, DynamicallyReferencedMethodEmitEARIEvents, DynamicallyReferencedMethodEmitIEvents,
    DynamicallyReferencedMethodOnIEvents,
    DynamicallyReferencedMethodType,
    ServiceEventsBase,
} from "../interfaces";
import { SBEvents } from "../serviceBase";
import { BSBService } from "./BSBService";
import { BSBServiceClient } from "./BSBServiceClient";

export abstract class BSBPluginEvents {
    public abstract onEvents: ServiceEventsBase;
    public abstract emitEvents: ServiceEventsBase;
    public abstract onReturnableEvents: ServiceEventsBase;
    public abstract emitReturnableEvents: ServiceEventsBase;
    public abstract onBroadcast: ServiceEventsBase;
    public abstract emitBroadcast: ServiceEventsBase;
}
/**
 * @group Events
 * @category Plugin Development Tools
 */
export class PluginEvents<
    onEvents = ServiceEventsBase,
    emitEvents = ServiceEventsBase,
    onReturnableEvents = ServiceEventsBase,
    emitReturnableEvents = ServiceEventsBase,
    onBroadcast = ServiceEventsBase,
    emitBroadcast = ServiceEventsBase
> {
    private events: SBEvents;
    private service: BSBService<any, any> | BSBServiceClient<any>;
    private cachedPluginName: string;

    constructor(
        mode: DEBUG_MODE,
        events: SBEvents,
        context: BSBService | BSBServiceClient,
    ) {
        this.events = events;
        this.service = context;
        this.cachedPluginName = context.pluginName; // Cache to avoid property access
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
     * await this.emitBroadcast('myEvent', trace, 'some', 'data'); // This will be typesafe
     *
     * /// Plugin that receives a broadcast event
     * await this.onBroadcast('myEvent', async (trace: DTrace, some: string, data: string) => {
     *   /// Do something with the data
     * });
     */
    public onBroadcast<TA extends keyof onBroadcast>(
        ...args: DynamicallyReferencedMethodOnIEvents<
            DynamicallyReferencedMethodType<onBroadcast>,
            TA,
            false
        >
    ): Promise<void> {
        const event = args[0] as string;
        const trace = args[1] as DTrace;
        const listener = args[2] as unknown as (trace: DTrace, args: Array<any>) => Promise<void>;
        return this.events.onBroadcast(
            this.service,
            trace,
            this.cachedPluginName,
            event,
            listener
        );
    }

    /**
     * Emits a broadcast event that is received by all plugins that are listening for that event
     *
     * @param event - The event to emit
     * @param traceId - The trace ID to associate with the event
     * @param args - The arguments to pass to the event
     * @returns Promise that resolves when the event has been emitted
     *
     * @example
     * Basic example of using broadcast events
     * ```ts
     * /// Plugin that emits a broadcast event
     * await this.emitBroadcast('myEvent', trace, 'some', 'data'); // This will be typesafe
     *
     * /// Plugin that receives a broadcast event
     * await this.onBroadcast('myEvent', async (trace: DTrace, some: string, data: string) => {
     *   /// Do something with the data
     * });
     */
    public emitBroadcast<TA extends keyof emitBroadcast>(
        ...args: DynamicallyReferencedMethodEmitIEvents<
            DynamicallyReferencedMethodType<emitBroadcast>,
            TA
        >
    ): Promise<void> {
        const event = args[0] as string;
        const trace = args[1] as DTrace;
        const remainingArgs = args.slice(2);
        return this.events.emitBroadcast(
            trace,
            this.cachedPluginName,
            event,
            remainingArgs
        );
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
     * await this.emitEvent('myEvent', trace, 'some', 'data'); // This will be typesafe
     *
     * /// Plugin that receives an event
     * await this.onEvent('myEvent', async (trace: DTrace, some: string, data: string) => {
     *   /// Do something with the data
     * });
     */
    public async onEvent<TA extends keyof onEvents>(
        ...args: DynamicallyReferencedMethodOnIEvents<
            DynamicallyReferencedMethodType<onEvents>,
            TA,
            false
        >
    ): Promise<void> {
        const event = args[0] as string;
        const trace = args[1] as DTrace;
        const listener = args[2] as unknown as (trace: DTrace, args: Array<any>) => Promise<void>;
        return await this.events.onEvent(
            trace,
            this.service,
            this.cachedPluginName,
            event,
            listener
        );
    }

    /**
     * Emits an event that is received by the first plugin that is listening for that event (depends on events service)
     *
     * @param event - The event to emit
     * @param traceId - The trace ID to associate with the event
     * @param args - The arguments to pass to the event
     * @returns Promise that resolves when the event has been emitted
     *
     * @example
     * Basic example of using events
     * ```ts
     * /// Plugin that emits an event
     * await this.emitEvent('myEvent', trace, 'some', 'data'); // This will be typesafe
     *
     * /// Plugin that receives an event
     * await this.onEvent('myEvent', async (trace: DTrace, some: string, data: string) => {
     *   /// Do something with the data
     * });
     */
    public async emitEvent<TA extends keyof emitEvents>(
        ...args: DynamicallyReferencedMethodEmitIEvents<
            DynamicallyReferencedMethodType<emitEvents>,
            TA
        >
    ): Promise<void> {
        const event = args[0] as string;
        const trace = args[1] as DTrace;
        const remainingArgs = args.slice(2);
        return await this.events.emitEvent(
            trace,
            this.cachedPluginName,
            event,
            ...remainingArgs
        );
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
     * await this.emitEventSpecific('serverId', 'myEvent', trace, 'some', 'data'); // This will be typesafe
     *
     * /// Plugin that receives an event
     * await this.onEventSpecific('serverId', 'myEvent', async (trace: DTrace, some: string, data: string) => {
     *   /// Do something with the data
     * });
     */
    public async onEventSpecific<TA extends keyof onEvents>(
        serverId: string,
        ...args: DynamicallyReferencedMethodOnIEvents<
            DynamicallyReferencedMethodType<onEvents>,
            TA,
            false
        >
    ): Promise<void> {
        const event = args[0] as string;
        const trace = args[1] as DTrace;
        const listener = args[2] as unknown as (trace: DTrace, args: Array<any>) => Promise<void>;
        return await this.events.onEventSpecific(
            trace,
            serverId,
            this.service,
            this.cachedPluginName,
            event,
            listener
        );
    }

    /**
     * Emits an event that is received by the first plugin that is listening for that event (depends on events service)
     * The serverId allows for the event to be handled by a specific plugin
     *
     * @param serverId - The server ID to emit the event on
     * @param event - The event to emit
     * @param traceId - The trace ID to associate with the event
     * @param args - The arguments to pass to the event
     * @returns Promise that resolves when the event has been emitted
     *
     * @example
     * Basic example of using events
     * ```ts
     * /// Plugin that emits an event
     * await this.emitEventSpecific('serverId', 'myEvent', trace, 'some', 'data'); // This will be typesafe
     *
     * /// Plugin that receives an event
     * await this.onEventSpecific('serverId', 'myEvent', async (trace: DTrace, some: string, data: string) => {
     *   /// Do something with the data
     * });
     */
    public async emitEventSpecific<TA extends keyof emitEvents>(
        serverId: string,
        ...args: DynamicallyReferencedMethodEmitIEvents<
            DynamicallyReferencedMethodType<emitEvents>,
            TA
        >
    ): Promise<void> {
        const event = args[0] as string;
        const trace = args[1] as DTrace;
        const remainingArgs = args.slice(2);
        return await this.events.emitEventSpecific(
            trace,
            serverId,
            this.cachedPluginName,
            event,
            ...remainingArgs
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
     * let result = await this.emitEventAndReturn('myEvent', trace, 'some', 'data'); // This will be typesafe
     *
     * /// Plugin that receives a returnable event
     * await this.onReturnableEvent('myEvent', async (trace: DTrace, some: string, data: string) => {
     *   /// Do something with the data
     *   return 'some result';
     * });
     */
    public async onReturnableEvent<TA extends keyof onReturnableEvents>(
        ...args: DynamicallyReferencedMethodOnIEvents<
            DynamicallyReferencedMethodType<onReturnableEvents>,
            TA,
            true
        >
    ): Promise<void> {
        const event = args[0] as string;
        const trace = args[1] as DTrace;
        const listener = args[2] as unknown as (trace: DTrace, args: Array<any>) => Promise<any>;
        return await this.events.onReturnableEvent(
            trace,
            this.service,
            this.cachedPluginName,
            event,
            listener
        );
    }

    /**
     * Emits a returnable event that is received by the first plugin that is listening for that event (depends on events service)
     *
     * @param event - The event listen to
     * @param traceId - The trace ID to associate with the event
     * @param args - The arguments to pass to the event
     * @returns Promise that resolves when the event has been emitted and the value has been returned
     *
     * @example
     * Basic example of using returnable events
     * ```ts
     * /// Plugin that emits a returnable event
     * let result = await this.emitEventAndReturn('myEvent', trace, 'some', 'data'); // This will be typesafe
     *
     * /// Plugin that receives a returnable event
     * await this.onReturnableEvent('myEvent', async (trace: DTrace, some: string, data: string) => {
     *   /// Do something with the data
     *   return 'some result';
     * });
     */
    public async emitEventAndReturn<TA extends keyof emitReturnableEvents>(
        ...args: DynamicallyReferencedMethodEmitEARIEvents<
            DynamicallyReferencedMethodType<emitReturnableEvents>,
            TA,
            true
        >
    ): Promise<
        DynamicallyReferencedMethodEmitEARIEvents<
            DynamicallyReferencedMethodType<emitReturnableEvents>,
            TA,
            false
        >
    > {
        const event = args[0] as string;
        const trace = args[1] as DTrace;
        const timeoutSeconds = args.length > 2 && typeof args[2] === 'number' ? (args[2] as number) : 5;
        const remainingArgs = timeoutSeconds !== 5 ? args.slice(3) : args.slice(2);
        return await this.events.emitEventAndReturn(
            trace,
            this.cachedPluginName,
            event,
            timeoutSeconds,
            ...remainingArgs
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
     * let result = await this.emitEventAndReturnSpecific('serverId', 'myEvent', trace, 'some', 'data'); // This will be typesafe
     *
     * /// Plugin that receives a returnable event
     * await this.onReturnableEventSpecific('serverId', 'myEvent', async (trace: DTrace, some: string, data: string) => {
     *   /// Do something with the data
     *   return 'some result';
     * });
     */
    public async onReturnableEventSpecific<TA extends keyof onReturnableEvents>(
        serverId: string,
        ...args: DynamicallyReferencedMethodOnIEvents<
            DynamicallyReferencedMethodType<onReturnableEvents>,
            TA,
            true
        >
    ): Promise<void> {
        const event = args[0] as string;
        const trace = args[1] as DTrace;
        const listener = args[2] as unknown as (trace: DTrace, args: Array<any>) => Promise<any>;
        return await this.events.onReturnableEventSpecific(
            trace,
            serverId,
            this.service,
            this.cachedPluginName,
            event,
            listener
        );
    }

    /**
     * Emits a returnable event that is received by the first plugin that is listening for that event (depends on events service)
     * The serverId allows for the event to be handled by a specific plugin
     *
     * @param serverId - The server ID to emit the event on
     * @param event - The event emit
     * @param traceId - The trace ID to associate with the event
     * @param args - The arguments to pass to the event
     * @returns Promise that resolves when the event has been emitted and the value has been returned
     *
     * @example
     * Basic example of using returnable events
     * ```ts
     * /// Plugin that emits a returnable event
     * let result = await this.emitEventAndReturnSpecific('serverId', 'myEvent', trace, 'some', 'data'); // This will be typesafe
     *
     * /// Plugin that receives a returnable event
     * await this.onReturnableEventSpecific('serverId', 'myEvent', async (trace: DTrace, some: string, data: string) => {
     *   /// Do something with the data
     *   return 'some result';
     * });
     */
    public async emitEventAndReturnSpecific<TA extends keyof emitReturnableEvents>(
        serverId: string,
        ...args: DynamicallyReferencedMethodEmitEARIEvents<
            DynamicallyReferencedMethodType<emitReturnableEvents>,
            TA,
            true
        >
    ): Promise<
        DynamicallyReferencedMethodEmitEARIEvents<
            DynamicallyReferencedMethodType<emitReturnableEvents>,
            TA,
            false
        >
    > {
        const event = args[0] as string;
        const trace = args[1] as DTrace;
        const timeoutSeconds = args.length > 2 && typeof args[2] === 'number' ? (args[2] as number) : 5;
        const remainingArgs = timeoutSeconds !== 5 ? args.slice(3) : args.slice(2);
        return await this.events.emitEventAndReturnSpecific(
            trace,
            serverId,
            this.cachedPluginName,
            event,
            timeoutSeconds,
            ...remainingArgs
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
     *  trace,
     *  'myStreamEvent',
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
     * await this.sendStream(trace, 'myStreamEvent', streamId, fs.createReadStream('./filein.txt'));
     * /// and then returns OK to the other plugin
     * ```
     */
    public async receiveStream(
        trace: DTrace,
        event: string,
        listener: { (error: Error | null, stream: Readable): Promise<void> },
        timeoutSeconds?: number,
    ): Promise<string> {
        return await this.events.receiveStream(
            trace,
            this.service,
            this.cachedPluginName,
            event,
            listener,
            timeoutSeconds,
        );
    }

    /**
     * Sends a stream to another plugin
     *
     * @param trace - The trace ID to associate with the event
     * @param streamId - The stream ID to stream data too
     * @param stream - The stream to send
     * @returns Promise that resolves when the stream has been fully sent
     *
     * @example
     * Basic example of using streams
     * ```ts
     * /// Plugin that receives a stream
     * let streamId = await this.receiveStream(
     *  trace,
     *  'myStreamEvent',
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
     * await this.sendStream(trace, 'myStreamEvent', streamId, fs.createReadStream('./filein.txt'));
     * /// and then returns OK to the other plugin
     * ```
     */
    public async sendStream(
        trace: DTrace,
        event: string,
        streamId: string,
        stream: Readable,
    ): Promise<void> {
        return await this.events.sendStream(
            trace,
            this.cachedPluginName,
            event,
            streamId,
            stream,
        );
    }
}

/**
 * @hidden
 * DO NOT REFERENCE/USE THIS CLASS - IT IS AN INTERNALLY REFERENCED CLASS
 */
export class BSBPluginEventsRef
    extends BSBPluginEvents {
    public onEvents: ServiceEventsBase = {};
    public emitEvents: ServiceEventsBase = {};
    public onReturnableEvents: ServiceEventsBase = {};
    public emitReturnableEvents: ServiceEventsBase = {};
    public onBroadcast: ServiceEventsBase = {};
    public emitBroadcast: ServiceEventsBase = {};
}
