/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.  
 * Copyright (C) 2024 BetterCorp (PTY) Ltd  
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

import {BSBConfig, PluginLogger, SmartFunctionCallAsync, SmartFunctionCallSync, Tools} from "../base";
import {
  DEBUG_MODE,
  EventsConfig,
  IPluginLogger,
  LoadedPlugin,
  LoggingConfig,
  PluginDefinition,
  PluginType,
} from "../interfaces";
import {Plugin as DefaultConfig} from "../plugins/config-default/index";
import {SBLogging} from "./logging";
import {SBPlugins} from "./plugins";

/**
 * BSB Config Controller
 * @group Config
 * @category Extending BSB
 */
export class SBConfig {
  private mode: DEBUG_MODE = "development";
  private appId: string;
  private cwd: string;
  private sbPlugins: SBPlugins;
  private sbLogging: SBLogging;
  private log: IPluginLogger;
  private configPlugin: BSBConfig;

  constructor(
      appId: string,
      mode: DEBUG_MODE,
      cwd: string,
      sbLogging: SBLogging,
      sbPlugins: SBPlugins,
  ) {
    this.appId = appId;
    this.mode = mode;
    this.cwd = cwd;
    this.sbLogging = sbLogging;
    this.sbPlugins = sbPlugins;
    this.log = new PluginLogger(mode, "sb-config", sbLogging);
    this.configPlugin = new DefaultConfig({
      appId,
      mode,
      pluginName: "sb-config",
      cwd,
      packageCwd: cwd,
      pluginCwd: cwd,
      sbLogging,
    });
  }

  public async getPluginConfig(pluginType: PluginType, name: string) {
    return await this.configPlugin.getPluginConfig(pluginType, name);
  }

  public async getServicePlugins(): Promise<Record<string, PluginDefinition>> {
    return await this.configPlugin.getServicePlugins();
  }

  public async getEventsPlugins(): Promise<Record<string, EventsConfig>> {
    return await this.configPlugin.getEventsPlugins();
  }

  public async getLoggingPlugins(): Promise<Record<string, LoggingConfig>> {
    return await this.configPlugin.getLoggingPlugins();
  }

  public async getMetricsPlugins(): Promise<Record<string, PluginDefinition>> {
    return await this.configPlugin.getMetricsPlugins();
  }

  public async getServicePluginDefinition(
      pluginName: string,
  ): Promise<{ name: string; enabled: boolean }> {
    return await this.configPlugin.getServicePluginDefinition(pluginName);
  }

  public dispose() {
    SmartFunctionCallSync(this.configPlugin, this.configPlugin.dispose);
  }

  private configPackage: string | undefined;
  private configPluginName = "config-default";

  public async setConfigPlugin(reference: LoadedPlugin<"config">) {
    this.configPlugin = new reference.plugin({
      appId: this.appId,
      mode: this.mode,
      pluginName: reference.name,
      cwd: this.cwd,
      packageCwd: reference.packageCwd,
      pluginCwd: reference.pluginCwd,
      sbLogging: this.sbLogging,
    });
    this.log.info("Adding {pluginName} as config", {
      pluginName: reference.name,
    });

    this.log.debug(`Init: {name}`, {
      name: this.configPluginName,
    });
    await SmartFunctionCallAsync(this.configPlugin, this.configPlugin.init);

    this.log.info(`Init: {name}: OK`, {
      name: this.configPluginName,
    });

    return this.configPlugin;
  }

  public async init(): Promise<void> {
    if (
        Tools.isString(process.env.BSB_LOGGER_PLUGIN) &&
        process.env.BSB_LOGGER_PLUGIN.startsWith("config-")
    ) {
      this.configPluginName = process.env.BSB_LOGGER_PLUGIN;
      if (Tools.isString(process.env.BSB_LOGGER_PLUGIN_PACKAGE)) {
        this.configPackage = process.env.BSB_LOGGER_PLUGIN_PACKAGE;
      }
    }
    this.log.debug("Add config {name} from ({package})", {
      package: this.configPackage ?? "this project",
      name: this.configPluginName,
    });
    if (this.configPluginName === "config-default") {
      await SmartFunctionCallAsync(this.configPlugin, this.configPlugin.init);
      return;
    }
    this.log.debug(`Import config plugin: {name} from ({package})`, {
      package: this.configPackage ?? "this project",
      name: this.configPluginName,
    });

    const newPlugin = await this.sbPlugins.loadPlugin<"config">(
        this.log,
        this.configPackage ?? null,
        this.configPluginName,
        this.configPluginName,
    );
    if (newPlugin === null) {
      this.log.error(
          "Failed to import config plugin: {name} from ({package})",
          {
            package: this.configPackage ?? "this project",
            name: this.configPluginName,
          }
      );
      return;
    }

    await this.setConfigPlugin(newPlugin);
  }
}
