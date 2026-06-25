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
 */

import {
  EventsConfig,
  ObservableConfig,
  PluginDefinition,
  PluginType,
  PluginTypes,
  Tools,
  BSBError,
  Observable,
} from "../../index.js";
import { BSBConfig, BSBConfigConstructor } from "../../base/BSBConfig.js";
import { createConfigSchema } from "../../base/PluginConfig.js";
import * as av from "anyvali";
import { ConfigDefinition, ConfigProfile } from "../config-default/interfaces.js";

const ConfigSchema = av.object({
  BSB_PROFILE: av.string().default("default").describe("Active configuration profile name"),
  BSB_CONFIG_JSON: av.string().minLength(1).describe("Full BSB runtime configuration JSON"),
}).describe("Environment JSON configuration plugin settings");

export const Config = createConfigSchema(
  {
    name: "config-env",
    description: "Environment JSON configuration plugin for BSB profile and plugin resolution",
    image: "../docs/public/assets/images/bsb-logo.png",
    tags: ["core", "config", "env"],
    documentation: [
      "./docs/core-plugins/config-env.md",
    ],
  },
  ConfigSchema
);

export class Plugin
  extends BSBConfig<InstanceType<typeof Config>> {
  static Config = Config;

  private _appConfig!: ConfigDefinition;
  private _deploymentProfile: string = "default";

  private createDefaultProfile(): ConfigProfile {
    return {
      observable: {},
      events: {},
      services: {},
    };
  }

  private getRequiredServices(obs?: Observable) {
    const services = this._appConfig[this._deploymentProfile].services ?? {};
    const enabledServices = Object.keys(services)
      .filter((x) => services[x].enabled === true);

    if (enabledServices.length === 0) {
      const message = "No enabled service plugins found in deployment profile ({deploymentProfile}); at least one service is required.";
      if (obs !== undefined) {
        throw new BSBError(
          obs.trace,
          message,
          { deploymentProfile: this._deploymentProfile },
        );
      }
      throw new Error(
        message.replace("{deploymentProfile}", this._deploymentProfile),
      );
    }

    return services;
  }

  constructor(config: BSBConfigConstructor<InstanceType<typeof Config>>) {
    super(config);
  }

  init(obs: Observable): void {
    this._deploymentProfile = this.config.BSB_PROFILE ?? "default";
    const defaultProfile = this.createDefaultProfile();
    this._appConfig = {
      default: defaultProfile,
    };

    let parsedConfig: unknown;
    try {
      parsedConfig = JSON.parse(this.config.BSB_CONFIG_JSON);
    } catch (error) {
      throw new BSBError(
        obs.trace,
        "Invalid BSB_CONFIG_JSON: {error}",
        { error: error instanceof Error ? error.message : String(error) },
      );
    }

    if (parsedConfig === null || typeof parsedConfig !== "object" || Array.isArray(parsedConfig)) {
      throw new BSBError(
        obs.trace,
        "Invalid BSB_CONFIG_JSON: expected a JSON object",
      );
    }

    this._appConfig = parsedConfig as ConfigDefinition;
    if (Tools.isNullOrUndefined(this._appConfig[this._deploymentProfile])) {
      throw new BSBError(
        obs.trace,
        "unknown deployment profile ({deploymentProfile}), please create it first.",
        {
          deploymentProfile: this._deploymentProfile,
        },
      );
    }
    this._appConfig[this._deploymentProfile] = Tools.mergeObjects(
      defaultProfile,
      this._appConfig[this._deploymentProfile],
    );
    obs.log.debug(
      "Config ready, using profile: {profile}", {
      profile: this._deploymentProfile,
    });
  }

  async getServicePluginDefinition(
    obs: Observable,
    pluginName: string,
  ): Promise<{ name: string; enabled: boolean }> {
    const keydPlugins = Object.keys(
      this._appConfig[this._deploymentProfile].services ?? {},
    );
    const keydWithMap = keydPlugins.map((x) => {
      return {
        mappedName: x,
        ...this._appConfig[this._deploymentProfile].services[x],
      };
    });
    let plugin = keydWithMap.find((x) => {
      return x.plugin === pluginName && x.enabled === true;
    });
    if (plugin !== undefined) {
      return {
        name: plugin.mappedName,
        enabled: plugin.enabled,
      };
    }
    plugin = keydWithMap.find((x) => {
      return x.plugin === pluginName;
    });
    if (plugin !== undefined) {
      return {
        name: plugin.mappedName,
        enabled: plugin.enabled,
      };
    }

    throw new BSBError(
      obs.trace,
      "Cannot find the plugin {plugin} in the config",
      {
        plugin: pluginName,
      },
    );
  }

  async getObservablePlugins(_obs: Observable): Promise<Record<string, ObservableConfig>> {
    const plugins = Object.keys(
      this._appConfig[this._deploymentProfile].observable ?? {},
    )
      .filter((x) => {
        return (
          this._appConfig[this._deploymentProfile].observable[x].enabled === true
        );
      });
    return plugins.reduce((acc, x) => {
      acc[x] = {
        version: this._appConfig[this._deploymentProfile].observable[x].version,
        plugin: this._appConfig[this._deploymentProfile].observable[x].plugin,
        package: this._appConfig[this._deploymentProfile].observable[x].package,
        enabled: this._appConfig[this._deploymentProfile].observable[x].enabled,
        filter: this._appConfig[this._deploymentProfile].observable[x].filter,
      };
      return acc;
    }, {} as Record<string, ObservableConfig>);
  }

  async getEventsPlugins(_obs: Observable): Promise<Record<string, EventsConfig>> {
    const plugins = Object.keys(
      this._appConfig[this._deploymentProfile].events ?? {},
    )
      .filter((x) => {
        return (
          this._appConfig[this._deploymentProfile].events[x].enabled === true
        );
      });
    return plugins.reduce((acc, x) => {
      acc[x] = {
        version: this._appConfig[this._deploymentProfile].events[x].version,
        plugin: this._appConfig[this._deploymentProfile].events[x].plugin,
        package: this._appConfig[this._deploymentProfile].events[x].package,
        enabled: this._appConfig[this._deploymentProfile].events[x].enabled,
        filter: this._appConfig[this._deploymentProfile].events[x].filter,
      };
      return acc;
    }, {} as Record<string, EventsConfig>);
  }

  async getServicePlugins(obs: Observable): Promise<Record<string, PluginDefinition>> {
    const services = this.getRequiredServices(obs);
    const plugins = Object.keys(services)
      .filter((x) => {
        return (
          services[x].enabled === true
        );
      });
    return plugins.reduce((acc, x) => {
      acc[x] = {
        version: services[x].version,
        plugin: services[x].plugin,
        package: services[x].package,
        enabled: services[x].enabled,
      };
      return acc;
    }, {} as Record<string, PluginDefinition>);
  }

  async getPluginConfig(
    _obs: Observable,
    pluginType: PluginType,
    plugin: string,
  ): Promise<object | null> {
    if (pluginType === PluginTypes.config) {
      return null;
    }
    let configKey: "services" | "observable" | "events" = "services";
    if (pluginType === PluginTypes.events) {
      configKey = "events";
    }
    if (pluginType === PluginTypes.observable) {
      configKey = "observable";
    }
    const pluginConfig = this._appConfig[this._deploymentProfile][configKey]?.[plugin]?.config;
    return Tools.isNullOrUndefined(pluginConfig) ? {} : pluginConfig;
  }

  async getPlugins(): Promise<
    {
      npmPackage: string | undefined | null;
      plugin: string;
      name: string;
      enabled: boolean;
    }[]
  > {
    const services = this.getRequiredServices();
    return Object.keys(services)
      .map(
        (x) => {
          return {
            npmPackage:
              services[x].package,
            plugin: services[x].plugin,
            name: x,
            enabled:
              services[x].enabled ===
              true,
          };
        },
      );
  }

  dispose() {
    this._appConfig = undefined!;
  }
}
