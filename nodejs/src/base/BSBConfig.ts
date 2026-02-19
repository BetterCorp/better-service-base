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
import { Observable, EventsConfig, ObservableConfig, PluginDefinition, PluginType } from "../interfaces";
import { BaseWithObservable, BaseWithObservableConfig } from "./base";
import { BSB_ERROR_METHOD_NOT_IMPLEMENTED } from "./errorMessages";
import { BSBReferencePluginConfigDefinition, BSBReferencePluginConfigType } from "./PluginConfig";

/**
 * @hidden
 */
type BSBConfigResolvedConfig<
  ReferencedConfig extends BSBReferencePluginConfigType
> = ReferencedConfig extends null
  ? null
  : BSBReferencePluginConfigDefinition<ReferencedConfig>;

type BSBConfigPropertyTypeSafe<T> = [T] extends [never]
  ? never
  : T extends undefined | null
  ? never
  : T;

type BSBConfigConstructorTypeSafe<T> = [T] extends [never]
  ? undefined
  : T extends undefined | null
  ? undefined
  : T;

/**
 * @hidden
 */
export interface BSBConfigConstructor<
  ReferencedConfig extends BSBReferencePluginConfigType = any
>
  extends BaseWithObservableConfig {
  config: BSBConfigConstructorTypeSafe<BSBConfigResolvedConfig<ReferencedConfig>>;
}

/**
 * @group Config
 * @category Plugins
 * @template T - The type of config for the plugin
 * Abstract class representing the configuration for the Better Service Base.
 * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBConfig.html | API: BSBConfig}
 */
export abstract class BSBConfig
<ReferencedConfig extends BSBReferencePluginConfigType = any>
  extends BaseWithObservable {
  public readonly config: BSBConfigPropertyTypeSafe<BSBConfigResolvedConfig<ReferencedConfig>>;

  constructor(config: BSBConfigConstructor<ReferencedConfig>) {
    super(config);
    this.config = config.config as BSBConfigPropertyTypeSafe<BSBConfigResolvedConfig<ReferencedConfig>>;
  }

  /**
   * Run lifecycle method for configuration plugins.
   *
   * This method is inherited from the base plugin class but is not used by configuration plugins.
   * Configuration plugins are initialized during the init phase and provide configuration data
   * to other plugins. They do not require a separate run phase.
   *
   * @remarks
   * Configuration plugins are typically disposed after all other plugins have been initialized
   * to free up memory, as configuration data is cached by individual plugins. Therefore, this
   * method intentionally performs no operation.
   *
   * @returns void
   *
   * @example
   * ```typescript
   * // Configuration plugins do not need to implement run()
   * // The base class provides this no-op implementation
   * export class MyConfigPlugin extends BSBConfig {
   *   // No run() override needed
   * }
   * ```
   *
   * @see {@link BSBConfig.init} for the initialization lifecycle method
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBConfig.html#run | API: BSBConfig#run}
   */
  public run(): void {}

  /**
   * Returns the observable plugins configuration (unified logging, metrics, tracing).
   * @returns Promise resolving to an object containing the observable configuration for each plugin.
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBConfig.html#getObservablePlugins | API: BSBConfig#getObservablePlugins}
   */
  abstract getObservablePlugins(obs: Observable): Promise<Record<string, ObservableConfig>>;

  /**
   * Returns the events plugins configuration.
   * @returns Promise resolving to an object containing the events configuration for each plugin.
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBConfig.html#getEventsPlugins | API: BSBConfig#getEventsPlugins}
   */
  abstract getEventsPlugins(obs: Observable): Promise<Record<string, EventsConfig>>;

  /**
   * Returns the service plugins configuration.
   * @returns Promise resolving to an object containing the configuration for each plugin.
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBConfig.html#getServicePlugins | API: BSBConfig#getServicePlugins}
   */
  abstract getServicePlugins(obs: Observable): Promise<Record<string, PluginDefinition>>;

  /**
   * Returns a mapped plugin name and whether the plugin is enabled or not
   * @returns string of the plugin name and if it is enabled or not
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBConfig.html#getServicePluginDefinition | API: BSBConfig#getServicePluginDefinition}
   */
  abstract getServicePluginDefinition(
    obs: Observable,
    pluginName: string,
  ): Promise<{ name: string; enabled: boolean }>;

  /**
   * Returns the configuration for a specific plugin.
   * @template T - The type of the configuration object.
   * @param plugin - The name of the plugin to retrieve the configuration for.
   * @returns Promise resolving to the configuration object for the specified plugin, or null if the plugin is not found.
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBConfig.html#getPluginConfig | API: BSBConfig#getPluginConfig}
   */
  abstract getPluginConfig(
    obs: Observable,
    pluginType: PluginType,
    plugin: string,
  ): Promise<object | null>;
}

/**
 * @hidden
 */
export class BSBConfigRef
  extends BSBConfig<null> {
  getObservablePlugins(obs: Observable): Promise<Record<string, ObservableConfig>> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBConfigRef", "getObservablePlugins");
  }

  getEventsPlugins(obs: Observable): Promise<Record<string, EventsConfig>> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBConfigRef", "getEventsPlugins");
  }

  getServicePlugins(obs: Observable): Promise<Record<string, PluginDefinition>> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBConfigRef", "getServicePlugins");
  }

  getPluginConfig(
    obs: Observable,
    pluginType: PluginType,
    plugin: string,
  ): Promise<object | null> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBConfigRef", "getPluginConfig");
  }

  getServicePluginDefinition(
    obs: Observable,
    pluginName: string,
  ): Promise<{ name: string; enabled: boolean }> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED(
      "BSBConfigRef",
      "getServicePluginName",
    );
  }

  dispose?(): void;

  init?(obs: Observable): void;
}
