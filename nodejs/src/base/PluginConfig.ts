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

import type { BaseSchema, Infer } from '@anyvali/js';

/**
 * The definition of the config with AnyVali validation
 * @example
 * const configDefinition = av.object({
 *  a: av.string(),
 * });
 */
export type BSBPluginConfigType = BaseSchema<any, any> | undefined;
export type BSBPluginConfigDefinition = BSBPluginConfig<BSBPluginConfigType>;
export type BSBPluginConfigClass<TSchema extends BSBPluginConfigType = BSBPluginConfigType> = {
  new(cwd: string, packageCwd: string, pluginCwd: string, pluginName: string): BSBPluginConfig<TSchema>;
  metadata: BSBPluginMetadata;
};

/**
 * Config migration handler, allows for config migrations when the plugin version changes or a new plugin setup is done
 * @example simple version change and basic setup
 * const configMigration = async (versionFrom: string | null, versionTo: string, existingConfig?: Infer<BSBConfigDefinition>) => {
 * if (versionFrom === null) {
 *  return {
 *   a: "a",
 *  };
 * }
 * return {
 *  a: "b",
 * };
 * @example basic setup and no version change handling
 * const configMigration = async (versionFrom: string | null, versionTo: string, existingConfig?: Infer<BSBConfigDefinition>) => {
 * if (versionFrom === null || existingConfig === undefined) {
 *  return {
 *   a: "a",
 *  };
 * }
 * return existingConfig;
 */
export type BSBConfigMigration<T extends BSBPluginConfigType> = (
    versionFrom: string | null,
    versionTo: string,
    existingConfig?: Infer<Exclude<T, undefined>>,
) => Promise<Infer<Exclude<T, undefined>>>;

/**
 * Plugin metadata information for enhanced discoverability and documentation.
 * Used for auto-generating PLUGIN_CLIENT and bsb-plugin.json.
 *
 * v9: This metadata is now the single source of truth for plugin information,
 * used to auto-generate both PLUGIN_CLIENT (for ServiceClient) and bsb-plugin.json.
 */
export interface BSBPluginMetadata {
    // Required fields
    /** Plugin identifier (e.g., "service-demo-todo") */
    name: string;
    /** Short description of what the plugin does */
    description: string;

    // Optional fields
    /** Author name or organization */
    author?: string;
    /** Plugin version */
    version?: string;
    /** License type (e.g., "MIT", "AGPL-3.0") */
    license?: string;
    /** Documentation URL */
    homepage?: string;
    /** Source repository URL */
    repository?: string;

    // BSB-specific fields
    /** Searchable tags for plugin discovery */
    tags?: string[];
    /** Relative paths to markdown documentation files (e.g., ["./docs/plugin.md"]) */
    documentation?: string[];
    /** Relative path to plugin image file (PNG recommended) */
    image?: string;
    /** Logical plugin category */
    category?: 'service' | 'observable' | 'events' | 'config' | 'other';

    // Plugin dependencies - controls initialization and run order
    /** This plugin must initialize before these plugins */
    initBeforePlugins?: string[];
    /** This plugin must initialize after these plugins */
    initAfterPlugins?: string[];
    /** This plugin must run before these plugins */
    runBeforePlugins?: string[];
    /** This plugin must run after these plugins */
    runAfterPlugins?: string[];
}

export type BSBConfigDefintionReference<
    T extends BSBPluginConfigType,
    AS = undefined
> = [T] extends [undefined] ? AS : Infer<Exclude<T, undefined>>;

export type BSBReferenceConfigType = BSBPluginConfigType | null;
export type BSBReferencePluginConfigType = BSBPluginConfig<BSBPluginConfigType> | null;
export type BSBReferenceConfigDefinition<
    ReferencedConfig extends BSBReferenceConfigType
> = ReferencedConfig extends null ? null : ReferencedConfig;
export type BSBReferencePluginConfigDefinition<
    ReferencedConfig extends BSBReferencePluginConfigType
> = ReferencedConfig extends null
    ? null
    : ReferencedConfig extends BSBPluginConfig<infer TSchema>
      ? BSBConfigDefintionReference<TSchema, never>
      : null;

/**
 * Base class for plugin configuration.
 *
 * Define your AnyVali validation schema in {@link validationSchema}. Prefer
 * versioned schemas that normalize old
 * configs into the latest shape at parse time.
 *
 * Optionally provide {@link metadata} for enhanced plugin discoverability.
 *
 * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBPluginConfig.html | API: BSBPluginConfig}
 */
export abstract class BSBPluginConfig<
    MyPluginConfig extends BSBPluginConfigType = undefined
> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(cwd: string, packageCwd: string, pluginCwd: string, pluginName: string) {
  }

  public abstract validationSchema: MyPluginConfig;

  /**
   * Static plugin metadata for v9 auto-generation features.
   * Set by createConfigSchema() helper.
   */
  static readonly metadata: BSBPluginMetadata;

  /**
   * Optional plugin metadata for enhanced discoverability and documentation.
   * Provides information about the plugin's purpose.
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBPluginConfig.html#metadata | API: BSBPluginConfig#metadata}
   */
  public metadata?: BSBPluginMetadata;
}

/**
 * @hidden
 * DO NOT REFERENCE/USE THIS CLASS - IT IS AN INTERNALLY REFERENCED CLASS
 */
export class BSBPluginConfigRef
    extends BSBPluginConfig<any> {
  public validationSchema = {};
}

/**
 * Helper function to create a typed plugin configuration class with metadata.
 *
 * v9 Breaking Change: This replaces the manual Config class pattern.
 * Instead of extending BSBPluginConfig directly, use this helper to create
 * a Config class with built-in metadata support.
 *
 * The metadata is used to:
 * - Auto-generate PLUGIN_CLIENT for ServiceClient usage
 * - Auto-generate bsb-plugin.json during build
 * - Provide plugin discovery and marketplace information
 *
 * @param metadata - Plugin metadata (name, description, version, dependencies, etc.)
 * @param schema - AnyVali validation schema for the plugin configuration
 * @returns A Config class that extends BSBPluginConfig with metadata
 *
 * @example
 * ```typescript
 * // v9 pattern:
 * const TodoConfigSchema = av.object({
 *   database: av.object({
 *     host: av.optional(av.string()).default('localhost'),
 *     port: av.optional(av.int32()).default(5432),
 *   }),
 * });
 *
 * export const Config = createConfigSchema(
 *   {
 *     name: 'service-demo-todo',
 *     description: 'Demo Todo Service',
 *     version: '1.0.0',
 *     author: 'BSB Team',
 *     license: 'MIT',
 *     category: 'service',
 *     tags: ['demo', 'todo', 'example'],
 *     initAfterPlugins: ['observable-default', 'events-default'],
 *   },
 *   TodoConfigSchema
 * );
 *
 * // Usage in plugin:
 * export class Plugin extends BSBService<typeof Config, typeof EventSchemas> {
 *   static Config = Config; // Required for auto-generation
 * }
 * ```
 *
 * @see {@link https://bsbcode.dev/languages/nodejs/types/functions/createConfigSchema.html | API: createConfigSchema}
 */
export function createConfigSchema<const TSchema extends BaseSchema<any, any>>(
  metadata: BSBPluginMetadata,
  schema: TSchema
): BSBPluginConfigClass<TSchema>;

export function createConfigSchema(
  metadata: BSBPluginMetadata
): BSBPluginConfigClass<undefined>;

export function createConfigSchema<const TSchema extends BSBPluginConfigType>(
  metadata: BSBPluginMetadata,
  schema?: TSchema
): BSBPluginConfigClass<TSchema> {
  const ConfigClass = class extends BSBPluginConfig<TSchema> {
    validationSchema = schema as TSchema;
    static readonly metadata = metadata;

    // Also expose metadata on instance for backward compatibility
    override metadata = metadata;
  };
  return ConfigClass as BSBPluginConfigClass<TSchema>;
}

/**
 * Extract category from plugin name based on directory prefix.
 * Examples:
 * - service-demo-todo -> service
 * - observable-axiom -> observable
 * - events-rabbitmq -> events
 * - config-default -> config
 */
export function getCategoryFromPluginName(pluginName: string): 'service' | 'observable' | 'events' | 'config' | 'other' {
  if (pluginName.startsWith('service-')) return 'service';
  if (pluginName.startsWith('observable-')) return 'observable';
  if (pluginName.startsWith('events-')) return 'events';
  if (pluginName.startsWith('config-')) return 'config';
  return 'other';
}
