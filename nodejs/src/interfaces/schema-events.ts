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

import { AnyValiDocument, BSBType, InferBSBType } from './schema-types';

/**
 * Schema definition for a returnable event with input/output validation.
 * Type-branded to ensure returnable events are only used in appropriate categories.
 * Uses BSBType for cross-language support instead of Zod schemas.
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#module-interfaces_schema_events | API: interfaces/schema-events}
 */
export interface ReturnableEventSchema {
  /** Schema for event input parameters (as a single object) */
  input: BSBType;
  /** Schema for event output/return value */
  output: BSBType;
  /** Optional description of what this event does */
  description?: string;
  /** Default timeout in seconds for returnable event calls */
  defaultTimeout?: number;
  /** Type brand for compile-time category validation */
  readonly __brand: 'returnable';
}

/**
 * Schema definition for fire-and-forget events.
 * Type-branded to ensure fire-and-forget events are only used in appropriate categories.
 * Uses BSBType for cross-language support instead of Zod schemas.
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#module-interfaces_schema_events | API: interfaces/schema-events}
 */
export interface FireAndForgetEventSchema {
  /** Schema for event input parameters (as a single object) */
  input: BSBType;
  /** Optional description of what this event does */
  description?: string;
  /** Type brand for compile-time category validation */
  readonly __brand: 'fire-and-forget';
}

/**
 * Schema definition for broadcast events.
 * Type-branded to ensure broadcast events are only used in appropriate categories.
 * Broadcast events are like fire-and-forget but delivered to ALL listeners.
 * Uses BSBType for cross-language support instead of Zod schemas.
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#module-interfaces_schema_events | API: interfaces/schema-events}
 */
export interface BroadcastEventSchema {
  /** Schema for event input parameters (as a single object) */
  input: BSBType;
  /** Optional description of what this event does */
  description?: string;
  /** Type brand for compile-time category validation */
  readonly __brand: 'broadcast';
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
 * Map of event names to their schemas for broadcast events.
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#module-interfaces_schema_events | API: interfaces/schema-events}
 */
export type BroadcastEventSchemas = Record<string, BroadcastEventSchema>;

/**
 * Complete event schema definition for a plugin with full type safety.
 * In v9+, use createEventSchemas() instead of 'as const' for type safety.
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
  emitBroadcast?: BroadcastEventSchemas;
  /** Broadcast events this plugin listens to */
  onBroadcast?: BroadcastEventSchemas;
}

/**
 * Extract the input type from an event schema by inferring from BSB type.
 * Uses direct property access to avoid excessive recursion.
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#module-interfaces_schema_events | API: interfaces/schema-events}
 */
export type EventInputType<T> = T extends { input: infer Schema extends BSBType }
  ? InferBSBType<Schema>
  : never;

/**
 * Extract the output type from an event schema by inferring from BSB type.
 * Uses direct property access to avoid excessive recursion.
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#module-interfaces_schema-events | API: interfaces/schema-events}
 */
export type EventOutputType<T> = T extends { output: infer Schema extends BSBType }
  ? InferBSBType<Schema>
  : never;

/**
 * Extract event names from a schema definition with full type safety.
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#module-interfaces_schema_events | API: interfaces/schema-events}
 */
export type EventNames<T extends Record<string, AnyEventSchema>> = keyof T;

/**
 * Extract input type for a specific event name from a schema map.
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#module-interfaces_schema_events | API: interfaces/schema-events}
 */
export type EventInputForName<T extends Record<string, AnyEventSchema>, K extends keyof T> =
  EventInputType<T[K]>;

/**
 * Extract output type for a specific event name from a schema map.
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#module-interfaces_schema_events | API: interfaces/schema-events}
 */
export type EventOutputForName<T extends Record<string, ReturnableEventSchema>, K extends keyof T> =
  EventOutputType<T[K]>;

/**
 * Helper function to create a fire-and-forget event schema.
 * Type-branded to ensure compile-time category validation.
 * v9: Uses BSBType for cross-language support. Type inference via InferBSBType.
 * @param input - BSB type schema for input validation
 * @param description - Optional description
 * @returns Event schema object with type brand
 * @see {@link https://bsbcode.dev/languages/nodejs/types/functions/createFireAndForgetEvent.html | API: createFireAndForgetEvent}
 */
export function createFireAndForgetEvent<TInput extends BSBType>(
  input: TInput,
  description?: string
): {
  input: TInput;
  description?: string;
  readonly __brand: 'fire-and-forget';
} {
  return { input, description, __brand: 'fire-and-forget' as const };
}

/**
 * Helper function to create a returnable event schema.
 * Type-branded to ensure compile-time category validation.
 * v9: Uses BSBType for cross-language support. Type inference via InferBSBType.
 * @param input - BSB type schema for input validation
 * @param output - BSB type schema for output validation
 * @param description - Optional description
 * @returns Event schema object with type brand
 * @see {@link https://bsbcode.dev/languages/nodejs/types/functions/createReturnableEvent.html | API: createReturnableEvent}
 */
export function createReturnableEvent<TInput extends BSBType, TOutput extends BSBType>(
  input: TInput,
  output: TOutput,
  description?: string,
  defaultTimeout?: number
): {
  input: TInput;
  output: TOutput;
  description?: string;
  defaultTimeout?: number;
  readonly __brand: 'returnable';
} {
  return { input, output, description, defaultTimeout, __brand: 'returnable' as const };
}

/**
 * Helper function to create a broadcast event schema.
 * Broadcast events are fire-and-forget but delivered to ALL listeners, not just the first one.
 * Type-branded to ensure compile-time category validation.
 * v9: Uses BSBType for cross-language support. Type inference via InferBSBType.
 * @param input - BSB type schema for input validation
 * @param description - Optional description
 * @returns Event schema object with type brand
 * @see {@link https://bsbcode.dev/languages/nodejs/types/functions/createBroadcastEvent.html | API: createBroadcastEvent}
 */
export function createBroadcastEvent<TInput extends BSBType>(
  input: TInput,
  description?: string
): {
  input: TInput;
  description?: string;
  readonly __brand: 'broadcast';
} {
  return { input, description, __brand: 'broadcast' as const };
}

/**
 * Type-level validation helper for event schemas.
 * Ensures that each category only contains the correct branded event types.
 * @internal
 */
// type _ValidateEventSchemas<T> = {
//   [K in keyof T]: K extends 'emitEvents' | 'onEvents'
//     ? { [EventName: string]: FireAndForgetEventSchema }
//     : K extends 'emitReturnableEvents' | 'onReturnableEvents'
//     ? { [EventName: string]: ReturnableEventSchema }
//     : K extends 'emitBroadcast' | 'onBroadcast'
//     ? { [EventName: string]: BroadcastEventSchema }
//     : T[K];
// };
// 
/**
 * Helper function to create a complete event schema with all 6 event types and preserve type safety.
 *
 * v9 Breaking Change: This function now uses const type parameters to eliminate the need for 'as const'.
 * It also validates that event types match their categories at compile time using type branding.
 *
 * Features:
 * - No 'as const' required - type inference is automatic via const type parameter
 * - Compile-time validation that fire-and-forget events are in fire-and-forget categories
 * - Compile-time validation that returnable events are in returnable categories
 * - Compile-time validation that broadcast events are in broadcast categories
 * - Runtime duplicate name detection across categories (warns for developer clarity)
 *
 * @param schemas - Event schema definitions with type validation
 * @returns Complete event schema with preserved literal types
 * @see {@link https://bsbcode.dev/languages/nodejs/types/functions/createEventSchemas.html | API: createEventSchemas}
 *
 * @example
 * ```typescript
 * // v9: No 'as const' needed!
 * export const EventSchemas = createEventSchemas({
 *   emitEvents: {
 *     'todo.created': createFireAndForgetEvent(TodoItemSchema, 'Emitted when todo is created'),
 *   },
 *   emitReturnableEvents: {
 *     'todo.create': createReturnableEvent(CreateInputSchema, TodoItemSchema, 'Create a todo'),
 *   },
 * });
 *
 * // Compile error if wrong event type used:
 * // emitEvents: {
 * //   'todo.create': createReturnableEvent(...) // ❌ Type error!
 * // }
 * ```
 */
export function createEventSchemas<const T extends BSBEventSchemas>(
  schemas: T
): T {
  // Runtime duplicate name detection for developer clarity
  // Note: Duplicate names across categories are not technically invalid, but can be confusing
  if (process.env.NODE_ENV !== 'production') {
    const allNames = new Set<string>();
    const duplicates: string[] = [];

    const categories = [
      'emitEvents',
      'onEvents',
      'emitReturnableEvents',
      'onReturnableEvents',
      'emitBroadcast',
      'onBroadcast',
    ] as const;

    for (const category of categories) {
      const categorySchemas = schemas[category];
      if (categorySchemas) {
        for (const name of Object.keys(categorySchemas)) {
          if (allNames.has(name)) {
            duplicates.push(name);
          }
          allNames.add(name);
        }
      }
    }

    // Warn about duplicates to help developer clarity
    if (duplicates.length > 0) {
      const uniqueDuplicates = Array.from(new Set(duplicates));
      // Note: Using console.warn here as this runs at module load time before logger is available
      // In production, this check is skipped for performance
      // eslint-disable-next-line no-console
      console.warn(
        `[BSB Warning] Duplicate event names detected: ${uniqueDuplicates.join(', ')}\n` +
        `While not technically invalid, duplicate names across categories can confuse developers.\n` +
        `Consider using unique names for better clarity.`
      );
    }
  }

  return schemas;
}

/**
 * Union type for all possible event schemas.
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#module-interfaces_schema_events | API: interfaces/schema-events}
 */
export type AnyEventSchema = FireAndForgetEventSchema | ReturnableEventSchema | BroadcastEventSchema;

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

// ============================================================================
// Schema Export for Cross-Language Client Generation
// ============================================================================

/**
 * Event category type for exported schemas.
 */
export type EventCategory =
  | 'emitEvents'
  | 'onEvents'
  | 'emitReturnableEvents'
  | 'onReturnableEvents'
  | 'emitBroadcast'
  | 'onBroadcast';

/**
 * JSON Schema type definition for cross-language code generation.
 * Uses standard JSON Schema format with BSB-specific extensions.
 */
export type JSONSchemaType = AnyValiDocument;

/**
 * Exported event definition in JSON format.
 * Contains all information needed for cross-language client generation.
 */
export interface EventExportDefinition {
  /** Event type (fire-and-forget, returnable, broadcast) */
  type: 'fire-and-forget' | 'returnable' | 'broadcast';
  /** Event category (emitEvents, onReturnableEvents, etc.) */
  category: EventCategory;
  /** Human-readable description */
  description?: string;
  /** Default timeout in seconds for returnable event calls */
  defaultTimeout?: number;
  /** JSON Schema for input validation */
  inputSchema: AnyValiDocument;
  /** JSON Schema for output validation (null for fire-and-forget/broadcast) */
  outputSchema: AnyValiDocument | null;
}

/**
 * Complete exported schema for a plugin.
 * This is the format consumed by cross-language code generators.
 */
export interface EventSchemaExport {
  /** Plugin identifier */
  pluginName: string;
  /** Plugin version */
  version: string;
  /** Map of event names to their definitions */
  events: Record<string, EventExportDefinition>;
  /** Auto-detected plugin dependencies (from .bsb/clients/ imports) */
  dependencies?: Array<{ id: string; version: string }>;
  /** Config schema as JSON Schema (from Zod validation schema) */
  configSchema?: Record<string, any>;
}

/**
 * Export event schemas to JSON format for cross-language client generation.
 *
 * v9: This function converts BSB EventSchemas to a standardized JSON format
 * that can be consumed by code generators in other languages (C#, Go, Java, etc.)
 * similar to how TRPC exports schemas for TypeScript.
 *
 * The exported JSON includes:
 * - Event names and categories
 * - Input/output schemas in JSON Schema format
 * - Type metadata for cross-language type mapping (int32, uuid, datetime, etc.)
 * - Descriptions for documentation
 *
 * Client generators use this JSON to produce type-safe, idiomatic code
 * in their target language.
 *
 * @param pluginName - Plugin identifier (e.g., "service-demo-todo")
 * @param version - Plugin version (e.g., "1.0.0")
 * @param schemas - Event schemas created with createEventSchemas()
 * @returns JSON-serializable export object
 *
 * @example
 * ```typescript
 * export class Plugin extends BSBService<typeof Config, typeof EventSchemas> {
 *   static exportSchemas(): EventSchemaExport {
 *     return exportEventSchemas(
 *       Config.metadata.name,
 *       '',
 *       EventSchemas
 *     );
 *   }
 * }
 * ```
 *
 * @see {@link https://bsbcode.dev/languages/nodejs/types/functions/exportEventSchemas.html | API: exportEventSchemas}
 */
export function exportEventSchemas(
  pluginName: string,
  version: string,
  schemas: BSBEventSchemas
): EventSchemaExport {
  const events: Record<string, EventExportDefinition> = {};

  // Helper to process a category of events
  const processCategory = (
    category: EventCategory,
    categorySchemas: Record<string, AnyEventSchema> | undefined
  ) => {
    if (!categorySchemas) return;

    for (const [eventName, eventDef] of Object.entries(categorySchemas)) {
      // Determine event type from brand
      let type: 'fire-and-forget' | 'returnable' | 'broadcast';
      if (eventDef.__brand === 'returnable') {
        type = 'returnable';
      } else if (eventDef.__brand === 'broadcast') {
        type = 'broadcast';
      } else {
        type = 'fire-and-forget';
      }

      // Convert BSBType input schema to JSON Schema
      const { bsbToJsonSchema } = require('./schema-types');
      const inputSchema = bsbToJsonSchema(eventDef.input) as JSONSchemaType;

      // Convert output schema (if returnable)
      let outputSchema: JSONSchemaType | null = null;
      if (type === 'returnable' && 'output' in eventDef) {
        outputSchema = bsbToJsonSchema(eventDef.output) as JSONSchemaType;
      }

      events[eventName] = {
        type,
        category,
        description: eventDef.description,
        ...(type === 'returnable' && 'defaultTimeout' in eventDef && eventDef.defaultTimeout !== undefined
          ? { defaultTimeout: eventDef.defaultTimeout as number }
          : {}),
        inputSchema,
        outputSchema,
      };
    }
  };

  // Process all categories
  processCategory('emitEvents', schemas.emitEvents as any);
  processCategory('onEvents', schemas.onEvents as any);
  processCategory('emitReturnableEvents', schemas.emitReturnableEvents as any);
  processCategory('onReturnableEvents', schemas.onReturnableEvents as any);
  processCategory('emitBroadcast', schemas.emitBroadcast as any);
  processCategory('onBroadcast', schemas.onBroadcast as any);

  return {
    pluginName,
    version,
    events,
  };
}
