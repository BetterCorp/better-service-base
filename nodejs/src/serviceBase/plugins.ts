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

import {existsSync, readFileSync} from "node:fs";
import {join} from "node:path";
import {BSBError, BSBPluginConfig, BSBPluginConfigRef} from "../base";
import {IPluginLogger, LoadedPlugin, PluginType, PluginTypeDefinitionRef} from "../interfaces";

/**
 * BSB Plugins Controller
 * @group Plugins
 * @category Extending BSB
 */
export class SBPlugins {
  protected cwd: string;
  protected pluginDir: string;
  protected devMode: boolean;

  constructor(cwd: string, devMode: boolean) {
    this.cwd = cwd;
    this.devMode = devMode;
    if (
        typeof process.env.BSB_PLUGIN_DIR == "string" &&
        process.env.BSB_PLUGIN_DIR.length > 3
    ) {
      this.pluginDir = process.env.BSB_PLUGIN_DIR;
    }
    else {
      this.pluginDir = join(this.cwd, "./node_modules/");
    }
  }

  public async loadPlugin<
      NamedType extends PluginType,
      ClassType extends PluginTypeDefinitionRef<NamedType> = PluginTypeDefinitionRef<NamedType>
  >(
      log: IPluginLogger,
      npmPackage: string | null,
      plugin: string,
      name: string,
  ): Promise<LoadedPlugin<NamedType, ClassType> | null> {
    log.debug(`Plugin {name} from {package} try load as {pluginName}`, {
      name: plugin,
      pluginName: name,
      package: npmPackage ?? "self",
    });
    const nodeModulesLib = npmPackage !== null;
    let pluginPath = "";
    let packageCwd = this.cwd;
    let version = "0.0.0";
    if (!nodeModulesLib) {
      if (this.devMode) {
        pluginPath = join(this.cwd, "./src/plugins/" + plugin);
        if (!existsSync(pluginPath)) {
          pluginPath = "";
        }
      }
      if (pluginPath == "") {
        pluginPath = join(this.cwd, "./lib/plugins/" + plugin);
      }
    }
    else {
      packageCwd = join(this.pluginDir, npmPackage);
      pluginPath = join(packageCwd, "./lib/plugins/", plugin);

      const packageJsonPath = join(packageCwd, "./package.json");
      const packageJSON = JSON.parse(
          readFileSync(packageJsonPath, "utf-8")
              .toString(),
      );
      version = packageJSON.version;
    }
    if (!existsSync(pluginPath)) {
      log.error(`Plugin {name} in {package} not found`, {
        name: plugin,
        package: npmPackage ?? "self",
      });
      return null;
    }

    log.debug(`Plugin {name}: attempt to load from {path} as {pluginName}`, {
      name: plugin,
      path: pluginPath,
      pluginName: name,
    });

    let pluginFile = join(pluginPath, "./index.js");
    let serviceConfigDef: BSBPluginConfig<any> | null = null;
    //if (this.devMode) {
    const tsPluginFile = join(pluginPath, "./index.ts");
    if (existsSync(tsPluginFile)) {
      log.debug("Plugin {pluginName} running in development mode", {
        pluginName: name,
      });
      pluginFile = tsPluginFile;
    }

    if (!existsSync(pluginFile)) {
      throw new BSBError("Plugin {pluginName} not found at {location}", {
        pluginName: name,
        location: pluginFile,
      });
    }

    const importedPlugin = await import(pluginFile);

    if (importedPlugin.Plugin === undefined) {
      throw new BSBError(
          "Plugin {pluginName} does not export a Plugin class - so possibly not a valid BSB Plugin",
          {
            pluginName: name,
          },
      );
    }
    if (importedPlugin.Config !== undefined) {
      serviceConfigDef =
          new (
              importedPlugin.Config as typeof BSBPluginConfigRef
          )(
              this.cwd,
              packageCwd,
              pluginPath,
              name,
          );
    }

    return {
      name: name,
      ref: plugin,
      version: version,
      serviceConfig: serviceConfigDef,
      plugin: importedPlugin.Plugin,
      packageCwd: packageCwd,
      pluginCwd: pluginPath,
      pluginPath: pluginPath,
    };
  }
}
