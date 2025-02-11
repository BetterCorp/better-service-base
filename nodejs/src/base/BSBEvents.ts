/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.  
 * Copyright (C) 2024 BetterCorp (PTY) Ltd  
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
import { DTrace } from '../interfaces/metrics';

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
 * @category Plugin Development
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
     * This function is never used for events plugins.
     * @ignore @deprecated
     */
    public run() {
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
    public abstract onBroadcast(
        trace: DTrace,
        pluginName: string,
        event: string,
        listener: { (trace: DTrace, args: Array<any>): Promise<void> },
    ): Promise<void>;

    /**
     * Emits an event that is received by all plugins
     *
     * @param callerPluginName - The name of the plugin that is calling this function
     * @param trace - The trace to use
     * @param pluginName - The name of the plugin that is emitting the event
     * @param event - The event to emit
     * @param args - The arguments to pass to the event listener
     * @returns Promise that resolves when the event has been emitted
     *
     * @see BSB events-default plugin for an example of how to use this function
     * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/events-default | Default Events Plugin}
     */
    public abstract emitBroadcast(

        trace: DTrace,
        pluginName: string,
        event: string,
        args: Array<any>,
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
        trace: DTrace,
        pluginName: string,
        event: string,
        listener: { (trace: DTrace, args: Array<any>): Promise<void> },
    ): Promise<void>;

    /**
     * Emits an event that is received by a single plugin
     * Make sure to use the built in tests
     *
     * @param callerPluginName - The name of the plugin that is calling this function
     * @param trace - The trace to use
     * @param pluginName - The name of the plugin that is emitting the event
     * @param event - The event to emit
     * @param args - The arguments to pass to the event listener
     * @returns Promise that resolves when the event has been emitted
     *
     * @see BSB events-default plugin for an example of how to use this function
     * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/events-default | Default Events Plugin}
     */
    public abstract emitEvent(
        trace: DTrace,
        pluginName: string,
        event: string,
        args: Array<any>,
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
        trace: DTrace,
        pluginName: string,
        event: string,
        listener: { (trace: DTrace, args: Array<any>): Promise<any> },
    ): Promise<void>;

    /**
     * Emits an event that is received by a single plugin and returns a value
     * Make sure to use the built in tests
     *
     * @param callerPluginName - The name of the plugin that is calling this function
     * @param trace - The trace to use
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
        trace: DTrace,
        pluginName: string,
        event: string,
        timeoutSeconds: number,
        args: Array<any>,
    ): Promise<any>;

    /**
     * Sets up a receive stream to receive a stream from another plugin
     *
     * @param callerPluginName - The name of the plugin that is calling this function
     * @param trace - The trace to use
     * @param event - The event to listen for
     * @param listener - The function to call when the stream is received
     * @param timeoutSeconds - The number of seconds to wait for the stream to be received
     * @returns Promise that resolves with the stream id that can be used to stream data to the listener
     *
     * @see BSB events-default plugin for an example of how to use this function
     * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/events-default | Default Events Plugin}
     */
    public abstract receiveStream(
        trace: DTrace,
        event: string,
        listener: (trace: DTrace, error: Error | null, stream: Readable) => Promise<void>,
        timeoutSeconds?: number,
    ): Promise<string>;

    /**
     * Sets up a send stream to send a stream to another plugin that created a receive stream
     *
     * @param callerPluginName - The name of the plugin that is calling this function
     * @param trace - The trace to use
     * @param event - The event to listen for
     * @param streamId - The id of the stream to send data to
     * @param stream - The stream to send data from
     * @returns Promise that resolves when the stream has been sent
     *
     * @see BSB events-default plugin for an example of how to use this function
     * @see {@link https://github.com/BetterCorp/better-service-base/tree/master/nodejs/src/plugins/events-default | Default Events Plugin}
     */
    public abstract sendStream(
        trace: DTrace,
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
        trace: DTrace,
        pluginName: string,
        event: string,
        listener: (trace: DTrace, args: any[]) => Promise<void>,
    ): Promise<void> {
        throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "onBroadcast");
    }

    public emitBroadcast(
        trace: DTrace,
        pluginName: string,
        event: string,
        args: any[],
    ): Promise<void> {
        throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "emitBroadcast");
    }

    public onEvent(
        trace: DTrace,
        pluginName: string,
        event: string,
        listener: (trace: DTrace, args: any[]) => Promise<void>,
    ): Promise<void> {
        throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "onEvent");
    }

    public emitEvent(
        trace: DTrace,
        pluginName: string,
        event: string,
        args: any[],
    ): Promise<void> {
        throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "emitEvent");
    }

    public onReturnableEvent(
        trace: DTrace,
        pluginName: string,
        event: string,
        listener: (trace: DTrace, args: any[]) => Promise<any>,
    ): Promise<void> {
        throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "onReturnableEvent");
    }

    public emitEventAndReturn(
        trace: DTrace,
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
        trace: DTrace,
        event: string,
        listener: (trace: DTrace, error: Error | null, stream: Readable) => Promise<void>,
        timeoutSeconds?: number | undefined,
    ): Promise<string> {
        throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "receiveStream");
    }

    public sendStream(
        trace: DTrace,
        event: string,
        streamId: string,
        stream: Readable,
    ): Promise<void> {
        throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "sendStream");
    }

    dispose?(): void;

    init?(trace: DTrace): void | Promise<void>;
}
