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

import {
  BSBConfig,
  ObservableBackend,
  SmartFunctionCallAsync,
  SmartFunctionCallSync,
  Tools
} from "../base";
import {
  DEBUG_MODE,
  DTrace,
  EventsConfig,
  IPluginObservable,
  LoadedPlugin,
  ObservableConfig,
  PluginDefinition,
  PluginType,
  createFakeDTrace,
  Observable,
} from "../interfaces";
import { Plugin as DefaultConfig } from "../plugins/config-default/index";
import { SBObservable } from "./observable";
import { SBPlugins } from "./plugins";

/**
 * @hidden
 */
function internalTrace(span: string): DTrace {
  return createFakeDTrace("serviceBase/SBConfig", span);
}

/**
 * BSB Config Controller
 * 
 * This class is responsible for managing the configuration in the BSB framework.
 * If you have a specific way of managing configuration, you can extend this class and then use your own class when creating the ServiceBase instance.
 * 
 * @group Config
 * @category Core
 */
export class SBConfig {
  /**
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/SBConfig.html | API: SBConfig}
   */
  private mode: DEBUG_MODE = "development";
  private appId: string;
  private cwd: string;
  private sbPlugins: SBPlugins;
  private sbObservable: SBObservable;
  private observableBackend: IPluginObservable;
  private configPlugin: BSBConfig;
  private createObservable: (trace: DTrace, pluginName: string, attributes?: Record<string, string | number | boolean>) => Observable;

  constructor(
    appId: string,
    mode: DEBUG_MODE,
    cwd: string,
    sbObservable: SBObservable,
    sbPlugins: SBPlugins,
    createObservable: (trace: DTrace, pluginName: string, attributes?: Record<string, string | number | boolean>) => Observable,
  ) {
    this.appId = appId;
    this.mode = mode;
    this.cwd = cwd;
    this.sbObservable = sbObservable;
    this.sbPlugins = sbPlugins;
    this.createObservable = createObservable;
    this.observableBackend = new ObservableBackend(mode, appId, "sb-config", sbObservable);
    this.configPlugin = new DefaultConfig({
      appId,
      mode,
      pluginName: "sb-config",
      cwd,
      packageCwd: cwd,
      pluginCwd: cwd,
      sbObservable,
      pluginVersion: "0.0.0",
    });
  }

  public async getPluginConfig(trace: DTrace, pluginType: PluginType, name: string) {
    const obs = this.createObservable(trace, "config");
    return await this.configPlugin.getPluginConfig(obs, pluginType, name);
  }

  public async getServicePlugins(trace: DTrace): Promise<Record<string, PluginDefinition>> {
    const obs = this.createObservable(trace, "config");
    return await this.configPlugin.getServicePlugins(obs);
  }

  public async getEventsPlugins(trace: DTrace): Promise<Record<string, EventsConfig>> {
    const obs = this.createObservable(trace, "config");
    return await this.configPlugin.getEventsPlugins(obs);
  }

  public async getObservablePlugins(trace: DTrace): Promise<Record<string, ObservableConfig>> {
    const obs = this.createObservable(trace, "config");
    return await this.configPlugin.getObservablePlugins(obs);
  }

  public async getServicePluginDefinition(
    trace: DTrace,
    pluginName: string,
  ): Promise<{ name: string; enabled: boolean }> {
    const obs = this.createObservable(trace, "config");
    return await this.configPlugin.getServicePluginDefinition(obs, pluginName);
  }

  /**
   * Dispose config subsystem
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/SBConfig.html#dispose | API: SBConfig.dispose}
   */
  public dispose() {
    SmartFunctionCallSync(this.configPlugin, this.configPlugin.dispose);
  }

  private configPackage: string | undefined;
  private configPluginName = "config-default";

  /**
   * Set the active config plugin implementation
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/SBConfig.html#setConfigPlugin | API: SBConfig.setConfigPlugin}
   */
  public async setConfigPlugin(reference: LoadedPlugin<"config">) {
    const tTrace = internalTrace(`setConfigPlugin`);
    this.configPlugin = new reference.plugin({
      appId: this.appId,
      mode: this.mode,
      pluginName: reference.name,
      cwd: this.cwd,
      packageCwd: reference.packageCwd,
      pluginCwd: reference.pluginCwd,
      sbObservable: this.sbObservable,
      pluginVersion: reference.version,
    });
    this.observableBackend.info(tTrace, "Adding {pluginName} as config", {
      pluginName: reference.name,
    });

    this.observableBackend.debug(tTrace, `Init: {name}`, {
      name: this.configPluginName,
    });
    const obs = this.createObservable(tTrace, "config");
    await SmartFunctionCallAsync(this.configPlugin, this.configPlugin.init, obs);

    this.observableBackend.info(tTrace, `Init: {name}: OK`, {
      name: this.configPluginName,
    });

    return this.configPlugin;
  }

  /**
   * Initialize config plugin (default or loaded)
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/SBConfig.html#init | API: SBConfig.init}
   */
  public async init(): Promise<void> {
    const tTrace = internalTrace(`init`);
    if (
      Tools.isString(process.env.BSB_LOGGER_PLUGIN) &&
      process.env.BSB_LOGGER_PLUGIN.startsWith("config-")
    ) {
      this.configPluginName = process.env.BSB_LOGGER_PLUGIN;
      if (Tools.isString(process.env.BSB_LOGGER_PLUGIN_PACKAGE)) {
        this.configPackage = process.env.BSB_LOGGER_PLUGIN_PACKAGE;
      }
    }
    this.observableBackend.debug(tTrace, "Add config {name} from ({package})", {
      package: this.configPackage ?? "this project",
      name: this.configPluginName,
    });
    if (this.configPluginName === "config-default") {
      const obs = this.createObservable(tTrace, "config");
      await SmartFunctionCallAsync(this.configPlugin, this.configPlugin.init, obs);
      return;
    }
    this.observableBackend.debug(tTrace, `Import config plugin: {name} from ({package})`, {
      package: this.configPackage ?? "this project",
      name: this.configPluginName,
    });

    const newPlugin = await this.sbPlugins.loadPlugin<"config">(
      this.observableBackend,
      this.configPackage ?? null,
      this.configPluginName,
      this.configPluginName,
    );
    if (newPlugin === null || !newPlugin.success) {
      this.observableBackend.error(tTrace,
        "Failed to import config plugin: {name} from ({package})",
        {
          package: this.configPackage ?? "this project",
          name: this.configPluginName,
        }
      );
      return;
    }

    await this.setConfigPlugin(newPlugin.data);
  }
}
