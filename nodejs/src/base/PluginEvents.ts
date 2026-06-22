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
    DEBUG_MODE, DTrace,
    BSBEventSchemas,
    EventInputType,
    EventOutputType,
    Observable,
    IPluginObservable,
} from "../interfaces/index.js";
import { SBEvents } from "../serviceBase/index.js";
import { BSBService } from "./BSBService.js";
import { BSBServiceClient } from "./BSBServiceClient.js";
import { EventValidator } from "./EventValidator.js";

/**
 * Plugin event schema definition.
 * Define event schemas once and get both TypeScript types and runtime validation.
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#BSBPluginEvents | API: BSBPluginEvents}
 */
export type BSBPluginEvents<T extends BSBEventSchemas = BSBEventSchemas> = T;

/**
 * Schema-first plugin events handler with automatic validation and object parameters.
 * @group Events
 * @category Plugin Development Tools
 * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/PluginEvents.html | API: PluginEvents}
 */
export class PluginEvents<TEventSchemas extends BSBEventSchemas = BSBEventSchemas, TClientApi extends boolean = false> {
    private events: SBEvents;
    private service: BSBService<any, any> | BSBServiceClient<any>;
    private cachedPluginName: string;
    private validator: EventValidator;
    private eventSchemas: TEventSchemas;

    constructor(
        mode: DEBUG_MODE,
        events: SBEvents,
        context: BSBService | BSBServiceClient,
        eventSchemas: TEventSchemas,
        observableBackend?: IPluginObservable
    ) {
        this.events = events;
        this.service = context;
        this.cachedPluginName = context.pluginName;
        this.eventSchemas = eventSchemas;
        this.validator = new EventValidator({}, observableBackend);
    }

    /**
     * Helper to extract DTrace from Observable | DTrace
     * @hidden
     */
    private extractTrace(obs: Observable | DTrace): DTrace {
        if ('trace' in obs && typeof obs.trace === 'object') {
            return obs.trace;
        }
        return obs as DTrace;
    }

    /**
     * Helper to create Observable from DTrace if needed
     * @hidden
     */
    private ensureObservable(obsOrTrace: Observable | DTrace): Observable {
        if ('trace' in obsOrTrace && 'log' in obsOrTrace) {
            return obsOrTrace as Observable;
        }
        // Create Observable from DTrace
        return (this.service as any).createObservable(obsOrTrace as DTrace);
    }

    /**
     * Listen for broadcast events emitted by other plugins with full type safety.
     * @param eventName - Name of the event to listen for (strongly typed)
     * @param obs - Observable context (v9 BREAKING: Observable only, no longer accepts DTrace)
     * @param listener - Function to call when event is received (receives Observable and validated input object)
     * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/PluginEvents.html#onBroadcast | API: PluginEvents#onBroadcast}
     */
    public async onBroadcast<
        TBroadcast extends NonNullable<TEventSchemas['onBroadcast']>,
        K extends keyof TBroadcast
    >(
        eventName: K,
        obs: Observable,
        listener: (handlerObs: Observable, input: EventInputType<TBroadcast[K]>) => Promise<void>
    ): Promise<void> {
        const trace = this.extractTrace(obs);

        const wrappedListener = async (handlerTrace: DTrace, rawInput: any) => {
            let validatedInput = rawInput;

            // Validate input if schema exists
            const schema = this.eventSchemas.onBroadcast?.[eventName as string];
            if (schema) {
                const result = this.validator.validateInput(eventName as string, rawInput, schema.input, handlerTrace);
                if (!result.success) {
                    throw result.error;
                }
                validatedInput = result.data as EventInputType<TBroadcast[K]>;
            }

            // Create Observable for handler
            const handlerObs = this.ensureObservable(handlerTrace);
            await listener(handlerObs, validatedInput);
        };

        return this.events.onBroadcast(
            this.service,
            trace,
            this.cachedPluginName,
            eventName as string,
            wrappedListener
        );
    }

    /**
     * Emit broadcast events to all listening plugins with full type safety.
     * @param eventName - Name of the event to emit (strongly typed)
     * @param obs - Observable context (v9 BREAKING: Observable only, no longer accepts DTrace)
     * @param input - Event input object (will be validated against schema)
     * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/PluginEvents.html#emitBroadcast | API: PluginEvents#emitBroadcast}
     */
    public async emitBroadcast<
        TBroadcast extends NonNullable<TEventSchemas['emitBroadcast']>,
        K extends keyof TBroadcast
    >(
        eventName: K,
        obs: Observable,
        input: EventInputType<TBroadcast[K]>
    ): Promise<void> {
        const trace = this.extractTrace(obs);
        let validatedInput = input;

        // Validate input if schema exists
        const schema = this.eventSchemas.emitBroadcast?.[eventName as string];
        if (schema) {
            const result = this.validator.validateInput(eventName as string, input, schema.input, trace);
            if (!result.success) {
                throw result.error;
            }
            validatedInput = result.data as EventInputType<TBroadcast[K]>;
        }

        return this.events.emitBroadcast(
            trace,
            this.cachedPluginName,
            eventName as string,
            [validatedInput]
        );
    }

    /**
     * Listen for fire-and-forget events from other plugins with full type safety.
     * @param eventName - Name of the event to listen for (strongly typed)
     * @param obs - Observable context (v9 BREAKING: Observable only, no longer accepts DTrace)
     * @param listener - Function to call when event is received (receives Observable and validated input object)
     * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/PluginEvents.html#onEvent | API: PluginEvents#onEvent}
     */
    public async onEvent<
        TEvents extends NonNullable<TEventSchemas['onEvents']>,
        K extends keyof TEvents
    >(
        eventName: K,
        obs: Observable,
        listener: (handlerObs: Observable, input: EventInputType<TEvents[K]>) => Promise<void>
    ): Promise<void> {
        const trace = this.extractTrace(obs);

        const wrappedListener = async (handlerTrace: DTrace, rawInput: any) => {
            let validatedInput = rawInput;

            // Validate input if schema exists
            const schema = this.eventSchemas.onEvents?.[eventName as string];
            if (schema) {
                const result = this.validator.validateInput(eventName as string, rawInput, schema.input, handlerTrace);
                if (!result.success) {
                    throw result.error;
                }
                validatedInput = result.data as EventInputType<TEvents[K]>;
            }

            // Create Observable for handler
            const handlerObs = this.ensureObservable(handlerTrace);
            await listener(handlerObs, validatedInput);
        };

        return this.events.onEvent(
            trace,
            this.service,
            this.cachedPluginName,
            eventName as string,
            wrappedListener
        );
    }

    public async onEventSpecific<
        TEvents extends NonNullable<TEventSchemas['onEvents']>,
        K extends keyof TEvents
    >(
        eventName: K,
        serverId: string,
        obs: Observable,
        listener: (handlerObs: Observable, input: EventInputType<TEvents[K]>) => Promise<void>
    ): Promise<void> {
        const trace = this.extractTrace(obs);
        const wrappedListener = async (handlerTrace: DTrace, rawInput: any) => {
            let validatedInput = rawInput;
            const schema = this.eventSchemas.onEvents?.[eventName as string];
            if (schema) {
                const result = this.validator.validateInput(eventName as string, rawInput, schema.input, handlerTrace);
                if (!result.success) throw result.error;
                validatedInput = result.data as EventInputType<TEvents[K]>;
            }
            await listener(this.ensureObservable(handlerTrace), validatedInput);
        };

        return this.events.onEventSpecific(
            trace,
            serverId,
            this.service,
            this.cachedPluginName,
            eventName as string,
            wrappedListener
        );
    }

    /**
     * Emit fire-and-forget events to other plugins with full type safety.
     * @param eventName - Name of the event to emit (strongly typed)
     * @param obs - Observable context (v9 BREAKING: Observable only, no longer accepts DTrace)
     * @param input - Event input object (will be validated against schema)
     * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/PluginEvents.html#emitEvent | API: PluginEvents#emitEvent}
     */
    public async emitEvent<
        TEvents extends NonNullable<TEventSchemas['emitEvents']>,
        K extends keyof TEvents
    >(
        eventName: K,
        obs: Observable,
        input: EventInputType<TEvents[K]>
    ): Promise<void> {
        const trace = this.extractTrace(obs);
        let validatedInput = input;

        // Validate input if schema exists
        const schema = this.eventSchemas.emitEvents?.[eventName as string];
        if (schema) {
            const result = this.validator.validateInput(eventName as string, input, schema.input, trace);
            if (!result.success) {
                throw result.error;
            }
            validatedInput = result.data as EventInputType<TEvents[K]>;
        }

        return this.events.emitEvent(
            trace,
            this.cachedPluginName,
            eventName as string,
            validatedInput
        );
    }

    public async emitEventSpecific<
        TEvents extends NonNullable<TEventSchemas['emitEvents']>,
        K extends keyof TEvents
    >(
        eventName: K,
        serverId: string,
        obs: Observable,
        input: EventInputType<TEvents[K]>
    ): Promise<void> {
        const trace = this.extractTrace(obs);
        let validatedInput = input;
        const schema = this.eventSchemas.emitEvents?.[eventName as string];
        if (schema) {
            const result = this.validator.validateInput(eventName as string, input, schema.input, trace);
            if (!result.success) throw result.error;
            validatedInput = result.data as EventInputType<TEvents[K]>;
        }

        return this.events.emitEventSpecific(
            trace,
            serverId,
            this.cachedPluginName,
            eventName as string,
            validatedInput
        );
    }

    /**
     * Listen for returnable events from other plugins with full type safety.
     * @param eventName - Name of the event to listen for (strongly typed)
     * @param obs - Observable context (v9 BREAKING: Observable only, no longer accepts DTrace)
     * @param listener - Function to call when event is received (receives Observable), must return a value
     * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/PluginEvents.html#onReturnableEvent | API: PluginEvents#onReturnableEvent}
     */
    public async onReturnableEvent<
        TEvents extends NonNullable<TEventSchemas['onReturnableEvents']>,
        K extends keyof TEvents
    >(
        eventName: K,
        obs: Observable,
        listener: (
            handlerObs: Observable,
            input: EventInputType<TEvents[K]>
        ) => Promise<EventOutputType<TEvents[K]>>
    ): Promise<void> {
        const trace = this.extractTrace(obs);

        const wrappedListener = async (handlerTrace: DTrace, rawInput: any) => {
            let validatedInput = rawInput;
            const schema = this.eventSchemas.onReturnableEvents?.[eventName as string];

            // Validate input if schema exists
            if (schema) {
                const inputResult = this.validator.validateInput(eventName as string, rawInput, schema.input, handlerTrace);
                if (!inputResult.success) {
                    throw inputResult.error;
                }
                validatedInput = inputResult.data as EventInputType<TEvents[K]>;
            }

            // Create Observable for handler
            const handlerObs = this.ensureObservable(handlerTrace);
            const result = await listener(handlerObs, validatedInput);

            // Validate output if schema exists
            if (schema) {
                const outputResult = this.validator.validateOutput(eventName as string, result, schema.output, handlerTrace);
                if (!outputResult.success) {
                    throw outputResult.error;
                }
                return outputResult.data as EventOutputType<TEvents[K]>;
            }

            return result;
        };

        return this.events.onReturnableEvent(
            trace,
            this.service,
            this.cachedPluginName,
            eventName as string,
            wrappedListener
        );
    }

    public async onReturnableEventSpecific<
        TEvents extends NonNullable<TEventSchemas['onReturnableEvents']>,
        K extends keyof TEvents
    >(
        eventName: K,
        serverId: string,
        obs: Observable,
        listener: (
            handlerObs: Observable,
            input: EventInputType<TEvents[K]>
        ) => Promise<EventOutputType<TEvents[K]>>
    ): Promise<void> {
        const trace = this.extractTrace(obs);
        const wrappedListener = async (handlerTrace: DTrace, rawInput: any) => {
            let validatedInput = rawInput;
            const schema = this.eventSchemas.onReturnableEvents?.[eventName as string];
            if (schema) {
                const inputResult = this.validator.validateInput(eventName as string, rawInput, schema.input, handlerTrace);
                if (!inputResult.success) throw inputResult.error;
                validatedInput = inputResult.data as EventInputType<TEvents[K]>;
            }
            const result = await listener(this.ensureObservable(handlerTrace), validatedInput);
            if (schema) {
                const outputResult = this.validator.validateOutput(eventName as string, result, schema.output, handlerTrace);
                if (!outputResult.success) throw outputResult.error;
                return outputResult.data as EventOutputType<TEvents[K]>;
            }
            return result;
        };

        return this.events.onReturnableEventSpecific(
            trace,
            serverId,
            this.service,
            this.cachedPluginName,
            eventName as string,
            wrappedListener
        );
    }

    /**
     * Emit returnable events and wait for response with full type safety.
     * @param eventName - Name of the event to emit (strongly typed)
     * @param obs - Observable context (v9 BREAKING: Observable only, no longer accepts DTrace)
     * @param input - Event input object (will be validated against schema)
     * @param timeoutSeconds - Optional timeout in seconds (default: 5)
     * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/PluginEvents.html#emitEventAndReturn | API: PluginEvents#emitEventAndReturn}
     */
    public async emitEventAndReturn<
        TEvents extends NonNullable<TEventSchemas['emitReturnableEvents']>,
        K extends keyof TEvents
    >(
        eventName: K,
        obs: Observable,
        input: EventInputType<TEvents[K]>,
        timeoutSeconds: number = 5
    ): Promise<EventOutputType<TEvents[K]>> {
        const trace = this.extractTrace(obs);
        let validatedInput = input;
        const schema = this.eventSchemas.emitReturnableEvents?.[eventName as string];

        // Validate input if schema exists
        if (schema) {
            const inputResult = this.validator.validateInput(eventName as string, input, schema.input, trace);
            if (!inputResult.success) {
                throw inputResult.error;
            }
            validatedInput = inputResult.data as EventInputType<TEvents[K]>;
        }

        const result = await this.events.emitEventAndReturn(
            trace,
            this.cachedPluginName,
            eventName as string,
            timeoutSeconds,
            validatedInput
        );

        // Validate output if schema exists
        if (schema) {
            const outputResult = this.validator.validateOutput(eventName as string, result, schema.output, trace);
            if (!outputResult.success) {
                throw outputResult.error;
            }
            return outputResult.data as EventOutputType<TEvents[K]>;
        }

        return result;
    }

    public async emitEventAndReturnSpecific<
        TEvents extends NonNullable<TEventSchemas['emitReturnableEvents']>,
        K extends keyof TEvents
    >(
        eventName: K,
        serverId: string,
        obs: Observable,
        input: EventInputType<TEvents[K]>,
        timeoutSeconds: number = 5
    ): Promise<EventOutputType<TEvents[K]>> {
        const trace = this.extractTrace(obs);
        let validatedInput = input;
        const schema = this.eventSchemas.emitReturnableEvents?.[eventName as string];
        if (schema) {
            const inputResult = this.validator.validateInput(eventName as string, input, schema.input, trace);
            if (!inputResult.success) throw inputResult.error;
            validatedInput = inputResult.data as EventInputType<TEvents[K]>;
        }

        const result = await this.events.emitEventAndReturnSpecific(
            trace,
            serverId,
            this.cachedPluginName,
            eventName as string,
            timeoutSeconds,
            validatedInput
        );

        if (schema) {
            const outputResult = this.validator.validateOutput(eventName as string, result, schema.output, trace);
            if (!outputResult.success) throw outputResult.error;
            return outputResult.data as EventOutputType<TEvents[K]>;
        }
        return result;
    }

    /**
     * Get stream ID for receiving streamed data from another plugin.
     * @param trace - Trace for logging context
     * @param eventName - Name of the stream event
     * @param listener - Function called when stream is received
     * @param timeoutSeconds - Optional timeout in seconds
     * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/PluginEvents.html#receiveStream | API: PluginEvents#receiveStream}
     */
    public async receiveStream(
        trace: DTrace,
        eventName: string,
        listener: (error: Error | null, stream: Readable) => Promise<void>,
        timeoutSeconds?: number
    ): Promise<string> {
        return this.events.receiveStream(
            trace,
            this.service,
            this.cachedPluginName,
            eventName,
            listener,
            timeoutSeconds
        );
    }

    /**
     * Send stream data to another plugin.
     * @param trace - Trace for logging context  
     * @param eventName - Name of the stream event
     * @param streamId - ID of the stream to send to
     * @param stream - The readable stream to send
     * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/PluginEvents.html#sendStream | API: PluginEvents#sendStream}
     */
    public async sendStream(
        trace: DTrace,
        eventName: string,
        streamId: string,
        stream: Readable
    ): Promise<void> {
        return this.events.sendStream(
            trace,
            this.cachedPluginName,
            eventName,
            streamId,
            stream
        );
    }
}

/**
 * @hidden
 * DO NOT REFERENCE/USE THIS CLASS - IT IS AN INTERNALLY REFERENCED CLASS
 */
export class BSBPluginEventsRef {
    public emitEvents = {};
    public onEvents = {};
    public emitReturnableEvents = {};
    public onReturnableEvents = {};
    public emitBroadcast = {};
    public onBroadcast = {};
}
