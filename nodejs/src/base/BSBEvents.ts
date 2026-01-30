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

/* eslint-disable @typescript-eslint/no-unused-vars */
import { Readable } from "node:stream";
import { BaseWithLoggingMetricsAndConfig, BaseWithLoggingMetricsAndConfigConfig } from "./base";
import { BSB_ERROR_METHOD_NOT_IMPLEMENTED } from "./errorMessages";
import { BSBReferencePluginConfigDefinition, BSBReferencePluginConfigType } from "./PluginConfig";
import { Observable } from '../interfaces/observable';

export interface BSBEventsConstructor<
    ReferencedConfig extends BSBReferencePluginConfigType = any
>
    extends BaseWithLoggingMetricsAndConfigConfig<
        ReferencedConfig extends null
        ? null
        : BSBReferencePluginConfigDefinition<ReferencedConfig>
    > {
}

/**
 * @group Events
 * @category Plugins
 * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBEvents.html | API: BSBEvents}
 */
export abstract class BSBEvents<
    ReferencedConfig extends BSBReferencePluginConfigType = any
>
    extends BaseWithLoggingMetricsAndConfig<
        ReferencedConfig extends null
        ? null
        : BSBReferencePluginConfigDefinition<ReferencedConfig>
    > {
    constructor(config: BSBEventsConstructor<ReferencedConfig>) {
        super(config);
    }

    /**
     * Run lifecycle method for events plugins.
     *
     * This method is inherited from the base plugin class but is not used by events plugins.
     * Events plugins are initialized during the init phase and begin processing events
     * immediately. They do not require a separate run phase.
     *
     * @remarks
     * Events plugins establish their event bus connections and listeners during initialization.
     * The event routing is active as soon as init completes. Therefore, this method
     * intentionally performs no operation.
     *
     * @returns void
     *
     * @example
     * ```typescript
     * // Events plugins do not need to implement run()
     * // The base class provides this no-op implementation
     * export class MyEventsPlugin extends BSBEvents<MyConfig> {
     *   // No run() override needed
     * }
     * ```
     *
     * @see {@link BSBEvents.init} for the initialization lifecycle method
     * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBEvents.html#run | API: BSBEvents#run}
     */
    public run(): void {}

    /**
     * Listens for events that are emitted by other plugins
     * Broadcast events are emitted and received by all plugins
     *
     * @param trace - The trace object for tracking the operation
     * @param pluginName - The name of the plugin that is being listened to
     * @param event - The event to listen for
     * @param listener - The function to call when the event is received
     * @returns Promise that resolves when the event listener has been registered
     *
     * @see BSB events-default plugin for an example of how to use this function
     * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/events-default | Default Events Plugin}
     * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBEvents.html#onBroadcast | API: BSBEvents#onBroadcast}
     */
    public abstract onBroadcast(
        trace: Observable,
        pluginName: string,
        event: string,
        listener: { (trace: Observable, args: Array<any>): Promise<void> },
    ): Promise<void>;

    /**
     * Emits an event that is received by all plugins
     *
     * @param trace - The trace object for tracking the operation
     * @param pluginName - The name of the plugin that is emitting the event
     * @param event - The event to emit
     * @param args - The arguments to pass to the event listener
     * @returns Promise that resolves when the event has been emitted
     *
     * @see BSB events-default plugin for an example of how to use this function
     * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/events-default | Default Events Plugin}
     * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBEvents.html#emitBroadcast | API: BSBEvents#emitBroadcast}
     */
    public abstract emitBroadcast(
        trace: Observable,
        pluginName: string,
        event: string,
        args: Array<any>,
    ): Promise<void>;

    /**
     * Listens for events that are emitted by other plugins
     * Events are emitted and received by a single plugin
     *
     * @param trace - The trace object for tracking the operation
     * @param pluginName - The name of the plugin that is being listened to
     * @param event - The event to listen for
     * @param listener - The function to call when the event is received
     * @returns Promise that resolves when the event listener has been registered
     *
     * @see BSB events-default plugin for an example of how to use this function
     * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/events-default | Default Events Plugin}
     * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBEvents.html#onEvent | API: BSBEvents#onEvent}
     */
    public abstract onEvent(
        trace: Observable,
        pluginName: string,
        event: string,
        listener: { (trace: Observable, args: Array<any>): Promise<void> },
    ): Promise<void>;

    /**
     * Emits an event that is received by a single plugin
     *
     * @param trace - The trace object for tracking the operation
     * @param pluginName - The name of the plugin that is emitting the event
     * @param event - The event to emit
     * @param args - The arguments to pass to the event listener
     * @returns Promise that resolves when the event has been emitted
     *
     * @see BSB events-default plugin for an example of how to use this function
     * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/events-default | Default Events Plugin}
     * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBEvents.html#emitEvent | API: BSBEvents#emitEvent}
     */
    public abstract emitEvent(
        trace: Observable,
        pluginName: string,
        event: string,
        args: Array<any>,
    ): Promise<void>;

    /**
     * Listens for events that are emitted by other plugins and return a value
     * Events are emitted and received by a single plugin
     *
     * @param trace - The trace object for tracking the operation
     * @param pluginName - The name of the plugin that is being listened to
     * @param event - The event to listen for
     * @param listener - The function to call when the event is received
     * @returns Promise that resolves when the event listener has been registered
     *
     * @see BSB events-default plugin for an example of how to use this function
     * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/events-default | Default Events Plugin}
     * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBEvents.html#onReturnableEvent | API: BSBEvents#onReturnableEvent}
     */
    public abstract onReturnableEvent(
        trace: Observable,
        pluginName: string,
        event: string,
        listener: { (trace: Observable, args: Array<any>): Promise<any> },
    ): Promise<void>;

    /**
     * Emits an event that is received by a single plugin and returns a value
     *
     * @param trace - The trace object for tracking the operation
     * @param pluginName - The name of the plugin that is emitting the event
     * @param event - The event to emit
     * @param timeoutSeconds - The number of seconds to wait for the value to be returned
     * @param args - The arguments to pass to the event listener
     * @returns Promise that resolves when the event has been emitted and the value has been returned
     *
     * @see BSB events-default plugin for an example of how to use this function
     * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/events-default | Default Events Plugin}
     * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBEvents.html#emitEventAndReturn | API: BSBEvents#emitEventAndReturn}
     */
    public abstract emitEventAndReturn(
        trace: Observable,
        pluginName: string,
        event: string,
        timeoutSeconds: number,
        args: Array<any>,
    ): Promise<any>;

    /**
     * Sets up a receive stream to receive a stream from another plugin
     *
     * @param trace - The trace object for tracking the operation
     * @param pluginName - The name of the plugin that is emitting the event
     * @param event - The event to listen for
     * @param listener - The function to call when the stream is received
     * @param timeoutSeconds - The number of seconds to wait for the stream to be received
     * @returns Promise that resolves with the stream id that can be used to stream data to the listener
     *
     * @see BSB events-default plugin for an example of how to use this function
     * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/events-default | Default Events Plugin}
     * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBEvents.html#receiveStream | API: BSBEvents#receiveStream}
     */
    public abstract receiveStream(
        trace: Observable,
        pluginName: string,
        event: string,
        listener: (trace: Observable, error: Error | null, stream: Readable) => Promise<void>,
        timeoutSeconds?: number,
    ): Promise<string>;

    /**
     * Sets up a send stream to send a stream to another plugin that created a receive stream
     *
     * @param trace - The trace object for tracking the operation
     * @param pluginName - The name of the plugin that is emitting the event
     * @param event - The event to listen for
     * @param streamId - The id of the stream to send data to
     * @param stream - The stream to send data from
     * @returns Promise that resolves when the stream has been sent
     *
     * @see BSB events-default plugin for an example of how to use this function
     * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/events-default | Default Events Plugin}
     * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBEvents.html#sendStream | API: BSBEvents#sendStream}
     */
    public abstract sendStream(
        trace: Observable,
        pluginName: string,
        event: string,
        streamId: string,
        stream: Readable,
    ): Promise<void>;
}

/**
 * @hidden
 * DO NOT REFERENCE/USE THIS CLASS - IT IS AN INTERNALLY REFERENCED CLASS
 */
export class BSBEventsRef
    extends BSBEvents {
    public onBroadcast(
        trace: Observable,
        pluginName: string,
        event: string,
        listener: (trace: Observable, args: any[]) => Promise<void>,
    ): Promise<void> {
        throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "onBroadcast");
    }

    public emitBroadcast(
        trace: Observable,
        pluginName: string,
        event: string,
        args: any[],
    ): Promise<void> {
        throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "emitBroadcast");
    }

    public onEvent(
        trace: Observable,
        pluginName: string,
        event: string,
        listener: (trace: Observable, args: any[]) => Promise<void>,
    ): Promise<void> {
        throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "onEvent");
    }

    public emitEvent(
        trace: Observable,
        pluginName: string,
        event: string,
        args: any[],
    ): Promise<void> {
        throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "emitEvent");
    }

    public onReturnableEvent(
        trace: Observable,
        pluginName: string,
        event: string,
        listener: (trace: Observable, args: any[]) => Promise<any>,
    ): Promise<void> {
        throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "onReturnableEvent");
    }

    public emitEventAndReturn(
        trace: Observable,
        pluginName: string,
        event: string,
        timeoutSeconds: number,
        args: any[],
    ): Promise<any> {
        throw BSB_ERROR_METHOD_NOT_IMPLEMENTED(
            "BSBEventsRef",
            "emitEventAndReturn",
        );
    }

    public receiveStream(
        trace: Observable,
        pluginName: string,
        event: string,
        listener: (trace: Observable, error: Error | null, stream: Readable) => Promise<void>,
        timeoutSeconds?: number | undefined,
    ): Promise<string> {
        throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "receiveStream");
    }

    public sendStream(
        trace: Observable,
        pluginName: string,
        event: string,
        streamId: string,
        stream: Readable,
    ): Promise<void> {
        throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "sendStream");
    }

    dispose?(): void;

    init?(obs: Observable): void | Promise<void>;
}
