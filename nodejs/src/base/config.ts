import { DEBUG_MODE } from "../interfaces/logging";
import { SBLogging } from "../serviceBase/logging";
import {
  EventsConfig,
  LoggingConfig,
  PluginDefition,
  PluginType,
} from "../interfaces/plugins";
import { BaseWithLogging } from "./base";
import { BSB_ERROR_METHOD_NOT_IMPLEMENTED } from "./errorMessages";

/**
 * Abstract class representing the configuration for the Better Service Base.
 * @template T - The type of config for the plugin
 */
export abstract class BSBConfig extends BaseWithLogging {
  constructor(
    appId: string,
    mode: DEBUG_MODE,
    pluginName: string,
    cwd: string,
    pluginCwd: string,
    logging: SBLogging
  ) {
    super(appId, mode, pluginName, cwd, pluginCwd, logging);
  }
  /**
   * This function is never used for events plugins.
   * @ignore @deprecated
   */
  public run() {}

  /**
   * Returns the logging plugins configuration.
   * @returns Promise resolving to an object containing the logging configuration for each plugin.
   */
  abstract getLoggingPlugins(): Promise<Record<string, LoggingConfig>>;

  /**
   * Returns the events plugins configuration.
   * @returns Promise resolving to an object containing the events configuration for each plugin.
   */
  abstract getEventsPlugins(): Promise<Record<string, EventsConfig>>;

  /**
   * Returns the service plugins configuration.
   * @returns Promise resolving to an object containing the configuration for each plugin.
   */
  abstract getServicePlugins(): Promise<Record<string, PluginDefition>>;

  /**
   * Returns a mapped plugin name and whether the plugin is enabled or not
   * @returns string of the plugin name and if it is enabled or not
   */
  abstract getServicePluginDefinition(
    pluginName: string
  ): Promise<{ name: string; enabled: boolean }>;

  /**
   * Returns the configuration for a specific plugin.
   * @template T - The type of the configuration object.
   * @param plugin - The name of the plugin to retrieve the configuration for.
   * @returns Promise resolving to the configuration object for the specified plugin, or null if the plugin is not found.
   */
  abstract getPluginConfig(
    pluginType: PluginType,
    plugin: string
  ): Promise<object | null>;
}

/**
 * DO NOT REFERENCE/USE THIS CLASS - IT IS AN INTERNALLY REFERENCED CLASS
 */
export class BSBConfigRef extends BSBConfig {
  getLoggingPlugins(): Promise<Record<string, LoggingConfig>> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBConfigRef", "getLoggingPlugins");
  }
  getEventsPlugins(): Promise<Record<string, EventsConfig>> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBConfigRef", "getEventsPlugins");
  }
  getServicePlugins(): Promise<Record<string, PluginDefition>> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBConfigRef", "getServicePlugins");
  }
  getPluginConfig(
    pluginType: PluginType,
    plugin: string
  ): Promise<object | null> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBConfigRef", "getPluginConfig");
  }
  getServicePluginDefinition(
    pluginName: string
  ): Promise<{ name: string; enabled: boolean }> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED(
      "BSBConfigRef",
      "getServicePluginName"
    );
  }
  dispose?(): void;
  init?(): void;
}
