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
import { DTrace, EventsConfig, LoggingConfig, PluginDefinition, PluginType } from "../interfaces";
import { BaseWithLogging, BaseWithLoggingConfig } from "./base";
import { BSB_ERROR_METHOD_NOT_IMPLEMENTED } from "./errorMessages";

/**
 * @hidden
 */
export type BSBConfigConstructor = BaseWithLoggingConfig;

/**
 * @group Config
 * @category Plugins
 * @template T - The type of config for the plugin
 * Abstract class representing the configuration for the Better Service Base.
 */
export abstract class BSBConfig
  extends BaseWithLogging {
  constructor(config: BSBConfigConstructor) {
    super(config);
  }

  /**
   * This function is never used for events plugins.
   * @ignore @deprecated
   */
  public run() {
  }

  /**
   * Returns the logging plugins configuration.
   * @returns Promise resolving to an object containing the logging configuration for each plugin.
   */
  abstract getLoggingPlugins(trace: DTrace): Promise<Record<string, LoggingConfig>>;

  /**
   * Returns the metrics plugins configuration.
   * @returns Promise resolving to an object containing the metrics configuration for each plugin.
   */
  abstract getMetricsPlugins(trace: DTrace): Promise<Record<string, PluginDefinition>>;

  /**
   * Returns the events plugins configuration.
   * @returns Promise resolving to an object containing the events configuration for each plugin.
   */
  abstract getEventsPlugins(trace: DTrace): Promise<Record<string, EventsConfig>>;

  /**
   * Returns the service plugins configuration.
   * @returns Promise resolving to an object containing the configuration for each plugin.
   */
  abstract getServicePlugins(trace: DTrace): Promise<Record<string, PluginDefinition>>;

  /**
   * Returns a mapped plugin name and whether the plugin is enabled or not
   * @returns string of the plugin name and if it is enabled or not
   */
  abstract getServicePluginDefinition(
    trace: DTrace,
    pluginName: string,
  ): Promise<{ name: string; enabled: boolean }>;

  /**
   * Returns the configuration for a specific plugin.
   * @template T - The type of the configuration object.
   * @param plugin - The name of the plugin to retrieve the configuration for.
   * @returns Promise resolving to the configuration object for the specified plugin, or null if the plugin is not found.
   */
  abstract getPluginConfig(
    trace: DTrace,
    pluginType: PluginType,
    plugin: string,
  ): Promise<object | null>;
}

/**
 * @hidden
 */
export class BSBConfigRef
  extends BSBConfig {
  getLoggingPlugins(trace: DTrace): Promise<Record<string, LoggingConfig>> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBConfigRef", "getLoggingPlugins");
  }

  getMetricsPlugins(trace: DTrace): Promise<Record<string, PluginDefinition>> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBConfigRef", "getMetricsPlugins");
  }

  getEventsPlugins(trace: DTrace): Promise<Record<string, EventsConfig>> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBConfigRef", "getEventsPlugins");
  }

  getServicePlugins(trace: DTrace): Promise<Record<string, PluginDefinition>> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBConfigRef", "getServicePlugins");
  }

  getPluginConfig(
    trace: DTrace,
    pluginType: PluginType,
    plugin: string,
  ): Promise<object | null> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBConfigRef", "getPluginConfig");
  }

  getServicePluginDefinition(
    trace: DTrace,
    pluginName: string,
  ): Promise<{ name: string; enabled: boolean }> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED(
      "BSBConfigRef",
      "getServicePluginName",
    );
  }

  dispose?(): void;

  init?(trace: DTrace): void;
}
