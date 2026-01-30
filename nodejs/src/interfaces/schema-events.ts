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

import { z } from "zod";

/**
 * Schema definition for a returnable event with input/output validation.
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#module-interfaces_schema_events | API: interfaces/schema-events}
 */
export interface ReturnableEventSchema<TInput = any, TOutput = any> {
  /** Schema for event input parameters (as a single object) */
  input: z.ZodType<TInput>;
  /** Schema for event output/return value */
  output: z.ZodType<TOutput>;
  /** Optional description of what this event does */
  description?: string;
  /** Optional examples for documentation */
  examples?: Array<{
    name: string;
    input: TInput;
    output: TOutput;
    description?: string;
  }>;
}

/**
 * Schema definition for fire-and-forget events.
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#module-interfaces_schema_events | API: interfaces/schema-events}
 */
export interface FireAndForgetEventSchema<TInput = any> {
  /** Schema for event input parameters (as a single object) */
  input: z.ZodType<TInput>;
  /** Optional description of what this event does */
  description?: string;
  /** Optional examples for documentation */
  examples?: Array<{
    name: string;
    input: TInput;
    description?: string;
  }>;
}

/**
 * Map of event names to their schemas for returnable events.
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#module-interfaces_schema_events | API: interfaces/schema-events}
 */
export type ReturnableEventSchemas = Record<string, ReturnableEventSchema>;

/**
 * Map of event names to their schemas for fire-and-forget events.
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#module-interfaces_schema_events | API: interfaces/schema-events}
 */
export type FireAndForgetEventSchemas = Record<string, FireAndForgetEventSchema>;

/**
 * Complete event schema definition for a plugin with full type safety.
 * Use 'as const' when defining schemas to preserve literal types.
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#module-interfaces_schema_events | API: interfaces/schema-events}
 */
export interface BSBEventSchemas {
  /** Events this plugin emits (fire-and-forget) */
  emitEvents?: FireAndForgetEventSchemas;
  /** Events this plugin listens to (fire-and-forget) */
  onEvents?: FireAndForgetEventSchemas;
  /** Returnable events this plugin emits */
  emitReturnableEvents?: ReturnableEventSchemas;
  /** Returnable events this plugin listens to */
  onReturnableEvents?: ReturnableEventSchemas;
  /** Broadcast events this plugin emits */
  emitBroadcast?: FireAndForgetEventSchemas;
  /** Broadcast events this plugin listens to */
  onBroadcast?: FireAndForgetEventSchemas;
}

/**
 * Extract the input type from an event schema with improved type safety.
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#module-interfaces_schema_events | API: interfaces/schema-events}
 */
export type EventInputType<T> = T extends ReturnableEventSchema<infer I, any> 
  ? I 
  : T extends FireAndForgetEventSchema<infer I>
    ? I 
    : never;

/**
 * Extract the output type from an event schema.
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#module-interfaces_schema_events | API: interfaces/schema-events}
 */
export type EventOutputType<T> = T extends ReturnableEventSchema<any, infer O> 
  ? O 
  : void;

/**
 * Extract event names from a schema definition with full type safety.
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#module-interfaces_schema_events | API: interfaces/schema-events}
 */
export type EventNames<T extends Record<string, FireAndForgetEventSchema | ReturnableEventSchema>> = keyof T;

/**
 * Extract input type for a specific event name from a schema map.
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#module-interfaces_schema_events | API: interfaces/schema-events}
 */
export type EventInputForName<T extends Record<string, FireAndForgetEventSchema | ReturnableEventSchema>, K extends keyof T> = 
  EventInputType<T[K]>;

/**
 * Extract output type for a specific event name from a schema map.
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#module-interfaces_schema_events | API: interfaces/schema-events}
 */
export type EventOutputForName<T extends Record<string, ReturnableEventSchema>, K extends keyof T> = 
  EventOutputType<T[K]>;

/**
 * Utility type to infer Zod schema type from schema definition.
 * This preserves full type safety when defining event schemas.
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#module-interfaces_schema_events | API: interfaces/schema-events}
 */
export type InferZodType<T extends z.ZodSchema> = z.infer<T>;

/**
 * Helper function to create a fire-and-forget event schema with preserved type information.
 * @param input - Zod schema for input validation
 * @param description - Optional description
 * @returns Event schema object with preserved types
 * @see {@link https://bsbcode.dev/languages/nodejs/types/functions/createFireAndForgetEvent.html | API: createFireAndForgetEvent}
 */
export function createFireAndForgetEvent<T extends z.ZodSchema>(
  input: T,
  description?: string
): FireAndForgetEventSchema<InferZodType<T>> {
  return { input, description } as FireAndForgetEventSchema<InferZodType<T>>;
}

/**
 * Helper function to create a returnable event schema with preserved type information.
 * @param input - Zod schema for input validation
 * @param output - Zod schema for output validation
 * @param description - Optional description
 * @returns Event schema object with preserved types
 * @see {@link https://bsbcode.dev/languages/nodejs/types/functions/createReturnableEvent.html | API: createReturnableEvent}
 */
export function createReturnableEvent<TInput extends z.ZodSchema, TOutput extends z.ZodSchema>(
  input: TInput,
  output: TOutput,
  description?: string
): ReturnableEventSchema<InferZodType<TInput>, InferZodType<TOutput>> {
  return { input, output, description } as ReturnableEventSchema<InferZodType<TInput>, InferZodType<TOutput>>;
}

/**
 * Helper function to create a broadcast event schema with preserved type information.
 * Broadcast events are fire-and-forget but delivered to ALL listeners, not just the first one.
 * @param input - Zod schema for input validation
 * @param description - Optional description
 * @returns Event schema object with preserved types
 * @see {@link https://bsbcode.dev/languages/nodejs/types/functions/createBroadcastEvent.html | API: createBroadcastEvent}
 */
export function createBroadcastEvent<T extends z.ZodSchema>(
  input: T,
  description?: string
): FireAndForgetEventSchema<InferZodType<T>> {
  return { input, description } as FireAndForgetEventSchema<InferZodType<T>>;
}

/**
 * Helper function to create a complete event schema with all 6 event types and preserve type safety.
 * This ensures the schema const names are type-safe and the structure is validated.
 * @param schemas - Event schema definitions
 * @returns Complete event schema with preserved types
 * @see {@link https://bsbcode.dev/languages/nodejs/types/functions/createEventSchemas.html | API: createEventSchemas}
 */
export function createEventSchemas<T extends BSBEventSchemas>(schemas: T): T {
  return schemas;
}

/**
 * Type helper to extract all event names from a complete event schema.
 * Useful for ensuring type safety when referencing event names.
 */
export type AllEventNames<T extends BSBEventSchemas> = 
  | (T['emitEvents'] extends Record<string, any> ? keyof T['emitEvents'] : never)
  | (T['onEvents'] extends Record<string, any> ? keyof T['onEvents'] : never)
  | (T['emitReturnableEvents'] extends Record<string, any> ? keyof T['emitReturnableEvents'] : never)
  | (T['onReturnableEvents'] extends Record<string, any> ? keyof T['onReturnableEvents'] : never)
  | (T['emitBroadcast'] extends Record<string, any> ? keyof T['emitBroadcast'] : never)
  | (T['onBroadcast'] extends Record<string, any> ? keyof T['onBroadcast'] : never);

/**
 * Type helper to extract emit event names only.
 */
export type EmitEventNames<T extends BSBEventSchemas> = 
  T['emitEvents'] extends Record<string, any> ? keyof T['emitEvents'] : never;

/**
 * Type helper to extract on event names only.
 */
export type OnEventNames<T extends BSBEventSchemas> = 
  T['onEvents'] extends Record<string, any> ? keyof T['onEvents'] : never;

/**
 * Type helper to extract emit returnable event names only.
 */
export type EmitReturnableEventNames<T extends BSBEventSchemas> = 
  T['emitReturnableEvents'] extends Record<string, any> ? keyof T['emitReturnableEvents'] : never;

/**
 * Type helper to extract on returnable event names only.
 */
export type OnReturnableEventNames<T extends BSBEventSchemas> = 
  T['onReturnableEvents'] extends Record<string, any> ? keyof T['onReturnableEvents'] : never;

/**
 * Type helper to extract emit broadcast event names only.
 */
export type EmitBroadcastEventNames<T extends BSBEventSchemas> = 
  T['emitBroadcast'] extends Record<string, any> ? keyof T['emitBroadcast'] : never;

/**
 * Type helper to extract on broadcast event names only.
 */
export type OnBroadcastEventNames<T extends BSBEventSchemas> = 
  T['onBroadcast'] extends Record<string, any> ? keyof T['onBroadcast'] : never;

/**
 * ServiceClient event schema with swapped RX/TX directions.
 * When using ServiceClient, the directions are inverted:
 * - ServiceClient.onEvent() listens to what the target service EMITs
 * - ServiceClient.emitEvent() sends to what the target service LISTENS FOR
 */
export interface ServiceClientEventSchemas<T extends BSBEventSchemas> {
  /** Listen to events the target service emits (fire-and-forget) */
  onEvents?: T['emitEvents'];
  /** Emit events to what the target service listens for (fire-and-forget) */
  emitEvents?: T['onEvents'];
  /** Listen to returnable events the target service emits (requests from target) */
  onReturnableEvents?: T['emitReturnableEvents'];
  /** Emit returnable events to what the target service handles (requests to target) */
  emitReturnableEvents?: T['onReturnableEvents'];
  /** Listen to broadcast events the target service emits */
  onBroadcast?: T['emitBroadcast'];
  /** Emit broadcast events to what the target service listens for */
  emitBroadcast?: T['onBroadcast'];
}