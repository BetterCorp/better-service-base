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

import * as path from "node:path";
import * as fs from "node:fs";
import { parse } from "yaml";
import {
  EventsConfig,
  ObservableConfig,
  PluginDefinition,
  PluginType,
  PluginTypes, Tools,
  BSBError,
  Observable,
} from "../../index.js";
import { BSBConfig, BSBConfigConstructor } from "../../base/BSBConfig.js";
import { createConfigSchema } from "../../base/PluginConfig.js";
import * as av from "anyvali";
import { ConfigDefinition, ConfigProfile } from "./interfaces.js";

const ConfigSchema = av.object({
  BSB_PROFILE: av.string().default("default").describe("Active configuration profile name"),
  BSB_CONFIG_FILE: av.string().default("./sec-config.yaml").describe("Path to the root BSB configuration file"),
}).describe("Default configuration plugin settings");

export const Config = createConfigSchema(
  {
    name: "config-default",
    description: "Default configuration plugin for profile and plugin resolution",
    image: "../docs/public/assets/images/bsb-logo.png",
    tags: ["core", "config", "default"],
    documentation: [
      "./docs/core-plugins/config-default.md",
      "./docs/core-plugins/config-default-reference.md",
    ],
  },
  ConfigSchema
);

export class Plugin
  extends BSBConfig<InstanceType<typeof Config>> {
  static Config = Config;

  private createDefaultProfile(): ConfigProfile {
    return {
      observable: {},
      events: {},
      services: {},
    };
  }

  private getProfileConfig(obs?: Observable): ConfigProfile {
    if (Tools.isNullOrUndefined(this._appConfig)) {
      const message = "Default config plugin has not been initialized before config access.";
      if (obs !== undefined) {
        throw new BSBError(obs.trace, message);
      }
      throw new Error(message);
    }

    const profile = this._appConfig[this._deploymentProfile];
    if (Tools.isNullOrUndefined(profile)) {
      const message = "unknown deployment profile ({deploymentProfile}), please create it first.";
      if (obs !== undefined) {
        throw new BSBError(obs.trace, message, { deploymentProfile: this._deploymentProfile });
      }
      throw new Error(message.replace("{deploymentProfile}", this._deploymentProfile));
    }

    return profile;
  }

  private getRequiredServices(obs?: Observable) {
    const services = this.getProfileConfig(obs).services ?? {};
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

  async getServicePluginDefinition(
    obs: Observable,
    pluginName: string,
  ): Promise<{ name: string; enabled: boolean }> {
    const keydPlugins = Object.keys(
      this.getProfileConfig(obs).services ?? {},
    );
    const keydWithMap = keydPlugins.map((x) => {
      return {
        mappedName: x,
        ...this.getProfileConfig(obs).services[x],
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
    const profile = this.getProfileConfig(_obs);
    const plugins = Object.keys(
      profile.observable ?? {},
    )
      .filter((x) => {
        return (
          profile.observable[x].enabled === true
        );
      });
    return plugins.reduce((acc, x) => {
      acc[x] = {
        version: profile.observable[x].version,
        plugin: profile.observable[x].plugin,
        package: profile.observable[x].package,
        enabled: profile.observable[x].enabled,
        filter: profile.observable[x].filter,
      };
      return acc;
    }, {} as Record<string, ObservableConfig>);
  }

  async getEventsPlugins(_obs: Observable): Promise<Record<string, EventsConfig>> {
    const profile = this.getProfileConfig(_obs);
    const plugins = Object.keys(
      profile.events ?? {},
    )
      .filter((x) => {
        return (
          profile.events[x].enabled === true
        );
      });
    return plugins.reduce((acc, x) => {
      acc[x] = {
        //name: this._appConfig[this._deploymentProfile].events[x].name,
        version: profile.events[x].version,
        plugin: profile.events[x].plugin,
        package: profile.events[x].package,
        enabled: profile.events[x].enabled,
        filter: profile.events[x].filter,
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
        //name: services[x].name,
        version: services[x].version,
        plugin: services[x].plugin,
        package: services[x].package,
        enabled: services[x].enabled,
      };
      return acc;
    }, {} as Record<string, PluginDefinition>);
  }

  async getPluginConfig(
    obs: Observable,
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
    const pluginConfig = this.getProfileConfig(obs)[configKey]?.[plugin]?.config;
    return Tools.isNullOrUndefined(pluginConfig) ? {} : pluginConfig;
  }

  dispose() {
    this._appConfig = undefined!;
  }

  private _appConfig!: ConfigDefinition;
  private _secConfigFilePath: string;
  private _deploymentProfile: string = "default";

  constructor(config: BSBConfigConstructor<InstanceType<typeof Config>>) {
    super(config);
    this._secConfigFilePath = path.join(this.cwd, this.config.BSB_CONFIG_FILE ?? "./sec-config.yaml");
  }

  init(obs: Observable): void {
    this._deploymentProfile = this.config.BSB_PROFILE ?? "default";
    this._secConfigFilePath = this.config.BSB_CONFIG_FILE ?? "./sec-config.yaml";
    const defaultProfile = this.createDefaultProfile();
    this._appConfig = {
      default: defaultProfile,
    };
    if (fs.existsSync(this._secConfigFilePath)) {
      this._appConfig =
        parse(fs.readFileSync(this._secConfigFilePath, "utf8")
          .toString()) ??
        this._appConfig;
    }
    else {
      throw new BSBError(
        obs.trace,
        "Cannot find config file at {filepath}",
        {
          filepath: this._secConfigFilePath,
        },
      );
    }
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
}
