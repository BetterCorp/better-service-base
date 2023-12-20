import * as path from "path";
import * as fs from "fs";
import { ConfigDefinition } from "./interfaces";
import { parse } from "yaml";
import { BSBConfig } from "../../base/config";
import {
  EventsConfig,
  LoggingConfig,
  PluginDefition,
  PluginType,
  PluginTypes,
} from "../../interfaces/plugins";
import { Tools } from "@bettercorp/tools/lib/Tools";
import { SBLogging } from "../../serviceBase/logging";
import { DEBUG_MODE } from "../../interfaces/logging";
import { BSBError } from "../../base/errorMessages";

export class Plugin extends BSBConfig {
  async getServicePluginDefinition(
    pluginName: string
  ): Promise<{ name: string; enabled: boolean }> {
    const keydPlugins = Object.keys(
      this._appConfig[this._deploymentProfile].services ?? {}
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
      "DEFAULT_CONFIG_GET_SERVICE_PLUGIN_NAME",
      "Cannot find the plugin {plugin} in the config",
      {
        plugin: pluginName,
      }
    );
  }
  async getLoggingPlugins(): Promise<Record<string, LoggingConfig>> {
    const plugins = Object.keys(
      this._appConfig[this._deploymentProfile].logging ?? {}
    ).filter((x) => {
      return (
        this._appConfig[this._deploymentProfile].logging[x].enabled === true
      );
    });
    return plugins.reduce((acc, x) => {
      acc[x] = {
        //name: this._appConfig[this._deploymentProfile].logging[x].name,
        plugin: this._appConfig[this._deploymentProfile].logging[x].plugin,
        package: this._appConfig[this._deploymentProfile].logging[x].package,
        enabled: this._appConfig[this._deploymentProfile].logging[x].enabled,
        filter: this._appConfig[this._deploymentProfile].logging[x].filter,
      };
      return acc;
    }, {} as Record<string, LoggingConfig>);
  }
  async getEventsPlugins(): Promise<Record<string, EventsConfig>> {
    const plugins = Object.keys(
      this._appConfig[this._deploymentProfile].events ?? {}
    ).filter((x) => {
      return (
        this._appConfig[this._deploymentProfile].events[x].enabled === true
      );
    });
    return plugins.reduce((acc, x) => {
      acc[x] = {
        //name: this._appConfig[this._deploymentProfile].events[x].name,
        plugin: this._appConfig[this._deploymentProfile].events[x].plugin,
        package: this._appConfig[this._deploymentProfile].events[x].package,
        enabled: this._appConfig[this._deploymentProfile].events[x].enabled,
        filter: this._appConfig[this._deploymentProfile].events[x].filter,
      };
      return acc;
    }, {} as Record<string, EventsConfig>);
  }
  async getServicePlugins(): Promise<Record<string, PluginDefition>> {
    const plugins = Object.keys(
      this._appConfig[this._deploymentProfile].services ?? {}
    ).filter((x) => {
      return (
        this._appConfig[this._deploymentProfile].services[x].enabled === true
      );
    });
    return plugins.reduce((acc, x) => {
      acc[x] = {
        //name: this._appConfig[this._deploymentProfile].services[x].name,
        plugin: this._appConfig[this._deploymentProfile].services[x].plugin,
        package: this._appConfig[this._deploymentProfile].services[x].package,
        enabled: this._appConfig[this._deploymentProfile].services[x].enabled,
      };
      return acc;
    }, {} as Record<string, PluginDefition>);
  }
  async getPluginConfig(
    pluginType: PluginType,
    plugin: string
  ): Promise<object | null> {
    if (pluginType === PluginTypes.config) return null;
    let configKey: "services" | "logging" | "events" = "services";
    if (pluginType === PluginTypes.events) configKey = "events";
    if (pluginType === PluginTypes.logging) configKey = "logging";
    return (
      this._appConfig[this._deploymentProfile][configKey][plugin].config ?? null
    );
  }
  dispose() {
    this._appConfig = undefined!;
  }
  private _appConfig!: ConfigDefinition;
  private _secConfigFilePath: string;
  private _deploymentProfile: string = "default";

  constructor(
    appId: string,
    mode: DEBUG_MODE,
    pluginName: string,
    cwd: string,
    pluginCwd: string,
    logging: SBLogging
  ) {
    super(appId, mode, pluginName, cwd, pluginCwd, logging);
    this._secConfigFilePath = path.join(this.cwd, "./sec-config.yaml");
  }

  init(): void {
    if (
      Tools.isString(process.env.BSB_PROFILE) &&
      process.env.BSB_PROFILE.length > 2
    ) {
      this._deploymentProfile = process.env.BSB_PROFILE!;
    }
    if (
      Tools.isString(process.env.BSB_CONFIG_FILE) &&
      process.env.BSB_CONFIG_FILE.length > 2
    ) {
      this._secConfigFilePath = process.env.BSB_CONFIG_FILE!;
    }
    this._appConfig = {
      default: {
        logging: {},
        events: {},
        services: {},
      },
    };
    if (fs.existsSync(this._secConfigFilePath)) {
      this._appConfig =
        parse(fs.readFileSync(this._secConfigFilePath, "utf8").toString()) ??
        this._appConfig;
    } else {
      throw new BSBError(
        "DEFAULT_CONFIG_SETUP_CONFIG",
        "Cannot find config file at {filepath}",
        {
          filepath: this._secConfigFilePath,
        }
      );
    }
    if (Tools.isNullOrUndefined(this._appConfig[this._deploymentProfile])) {
      throw new BSBError(
        "DEFAULT_CONFIG_SETUP_DEFINITION",
        "unknown deployment profile ({deploymentProfile}), please create it first.",
        {
          deploymentProfile: this._deploymentProfile,
        }
      );
    }
    this.log.debug("Config ready, using profile: {profile}", {
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
    return Object.keys(this._appConfig[this._deploymentProfile].services).map(
      (x) => {
        return {
          npmPackage:
            this._appConfig[this._deploymentProfile].services[x].package,
          plugin: this._appConfig[this._deploymentProfile].services[x].plugin,
          name: x,
          enabled:
            this._appConfig[this._deploymentProfile].services[x].enabled ===
            true,
        };
      }
    );
  }
}
