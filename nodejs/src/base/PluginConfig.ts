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

import {z} from "zod";

/**
 * The definition of the config with zod validation
 * @example
 * const configDefinition = z.object({
 *  a: z.string(),
 * });
 */
export type BSBPluginConfigType = z.ZodTypeAny | undefined;
export type BSBPluginConfigDefinition = BSBPluginConfig<z.ZodTypeAny>;

/**
 * Config migration handler, allows for config migrations when the plugin version changes or a new plugin setup is done
 * @example simple version change and basic setup
 * const configMigration = async (versionFrom: string | null, versionTo: string, existingConfig?: z.infer<BSBConfigDefinition>) => {
 * if (versionFrom === null) {
 *  return {
 *   a: "a",
 *  };
 * }
 * return {
 *  a: "b",
 * };
 * @example basic setup and no version change handling
 * const configMigration = async (versionFrom: string | null, versionTo: string, existingConfig?: z.infer<BSBConfigDefinition>) => {
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
    existingConfig?: z.infer<Exclude<T, undefined>>,
) => Promise<z.infer<Exclude<T, undefined>>>;

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
    /** Semantic version (e.g., "1.0.0") */
    version?: string;
    /** Author name or organization */
    author?: string;
    /** License type (e.g., "MIT", "AGPL-3.0") */
    license?: string;
    /** Documentation URL */
    homepage?: string;
    /** Source repository URL */
    repository?: string;

    // BSB-specific fields
    /** Plugin category for marketplace organization */
    category?: 'service' | 'observable' | 'events' | 'config' | 'other';
    /** Searchable tags for plugin discovery */
    tags?: string[];

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
> = T extends undefined ? AS : z.infer<Exclude<T, undefined>>;

export type BSBReferenceConfigType = BSBPluginConfigType | null;
export type BSBReferencePluginConfigType = BSBPluginConfigDefinition | null;
export type BSBReferenceConfigDefinition<
    ReferencedConfig extends BSBReferenceConfigType
> = ReferencedConfig extends null ? null : ReferencedConfig;
export type BSBReferencePluginConfigDefinition<
    ReferencedConfig extends BSBReferencePluginConfigType
> = ReferencedConfig extends null
    ? null
    : ReferencedConfig extends BSBPluginConfigDefinition
      ? z.infer<ReferencedConfig["validationSchema"]>
      : null;

/**
 * Base class for plugin configuration.
 *
 * Define your Zod validation schema in {@link validationSchema}. Prefer
 * versioned schemas using Zod unions and transforms to normalize old
 * configs into the latest shape at parse time.
 *
 * Optionally provide {@link metadata} for enhanced plugin discoverability.
 *
 * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBPluginConfig.html | API: BSBPluginConfig}
 */
export abstract class BSBPluginConfig<
    MyPluginConfig extends Exclude<BSBPluginConfigType, undefined> | null = null
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
 * @param schema - Zod validation schema for the plugin configuration
 * @returns A Config class that extends BSBPluginConfig with metadata
 *
 * @example
 * ```typescript
 * // v9 pattern:
 * const TodoConfigSchema = z.object({
 *   database: z.object({
 *     host: z.string().default('localhost'),
 *     port: z.number().default(5432),
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
export function createConfigSchema<const TSchema extends z.ZodTypeAny>(
  metadata: BSBPluginMetadata,
  schema: TSchema
): typeof BSBPluginConfig & { new(cwd: string, packageCwd: string, pluginCwd: string, pluginName: string): BSBPluginConfig<TSchema>; metadata: BSBPluginMetadata } {
  const ConfigClass = class extends BSBPluginConfig<TSchema> {
    validationSchema = schema;
    static readonly metadata = metadata;

    // Also expose metadata on instance for backward compatibility
    override metadata = metadata;
  };
  return ConfigClass as any;
}
