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

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BSBPluginConfig, BSBPluginConfigRef } from "../base";
import { createFakeDTrace, DTrace, IPluginLogging, LoadedPlugin, PluginType, PluginTypeDefinitionRef, Result, Ok, Err, fromPromise } from "../interfaces";

/**
 * @hidden
 */
function internalTrace(span: string): DTrace {
  return createFakeDTrace("serviceBase/SBPlugins", span);
}

/**
 * BSB Plugins Controller
 * 
 * This class is responsible for loading the plugins in the BSB framework.
 * If you have a specific way of loading plugins, you can extend this class and then use your own class when creating the ServiceBase instance.
 * 
 * @group Plugins
 * @category Core
 */
export class SBPlugins {
  /**
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/SBPlugins.html | API: SBPlugins}
   */
  protected cwd: string;
  protected nodeModulesPluginDir: string;
  protected referencedPluginDir: string | null = null;
  protected devMode: boolean;

  constructor(cwd: string, devMode: boolean) {
    this.cwd = cwd;
    this.devMode = devMode;
    this.nodeModulesPluginDir = join(this.cwd, "./node_modules/");
    if (
      typeof process.env.BSB_PLUGIN_DIR == "string" &&
      process.env.BSB_PLUGIN_DIR.length > 3
    ) {
      if (!existsSync(process.env.BSB_PLUGIN_DIR)) {
        throw new Error(`Plugin directory ${ process.env.BSB_PLUGIN_DIR } does not exist`);
      }
      this.referencedPluginDir = process.env.BSB_PLUGIN_DIR;
    }
  }

  public async loadPlugin<
    NamedType extends PluginType,
    ClassType extends PluginTypeDefinitionRef<NamedType> = PluginTypeDefinitionRef<NamedType>
  >(
    log: IPluginLogging,
    npmPackage: string | null,
    plugin: string,
    name: string,
  ): Promise<Result<LoadedPlugin<NamedType, ClassType>, Error>> {
    const tTrace = internalTrace(`loadPlugin:${ npmPackage }:${ plugin }`);
    log.debug(tTrace, `Plugin {name} from {package} try load as {pluginName}`, {
      name: plugin,
      pluginName: name,
      package: npmPackage ?? "self",
    });
    const nodeModulesLib = npmPackage !== null;
    let pluginPath = "";
    let packageCwd = this.cwd;
    let version = "1.0.0";
    if (!nodeModulesLib) {
      // If no package is defined in the config, we will not look anywhere else except for the local plugins
      if (this.devMode) {
        pluginPath = join(this.cwd, "./src/plugins/" + plugin);
        if (!existsSync(pluginPath)) {
          pluginPath = "";
        }
      }
      if (pluginPath == "") {
        pluginPath = join(this.cwd, "./lib/plugins/" + plugin);
      }
      const packageJsonPath = join(packageCwd, "./package.json");
      if (existsSync(packageJsonPath)) {
        const packageJSON = JSON.parse(
          readFileSync(packageJsonPath, "utf-8")
            .toString(),
        );
        version = packageJSON.version??'0.0.0';
      }
    } else {
      // If a package is defined in the config, we will look for the plugin in the BSB_PLUGIN_DIR env, followed by the node_modules directory. Local plugins are not used.
      if (this.referencedPluginDir) {
        const T1packageCwd = join(this.referencedPluginDir, npmPackage, version);
        const T1pluginPath = join(this.referencedPluginDir, npmPackage, version, "./lib/plugins/" + plugin);
        if (existsSync(T1pluginPath)) {
          pluginPath = T1pluginPath;
          packageCwd = T1packageCwd;
        } else {
          const T2pluginPath = join(this.referencedPluginDir, npmPackage, "latest", "./lib/plugins/" + plugin);
          const T2packageCwd = join(this.referencedPluginDir, npmPackage, "latest");
          if (existsSync(T2pluginPath)) {
            pluginPath = T2pluginPath;
            packageCwd = T2packageCwd;
          }
        }
      }
      if (pluginPath == '') {
        const T3pluginPath = join(this.nodeModulesPluginDir, npmPackage, "./lib/plugins/" + plugin);
        const T3packageCwd = join(this.nodeModulesPluginDir, npmPackage);
        if (existsSync(T3pluginPath)) {
          pluginPath = T3pluginPath;
          packageCwd = T3packageCwd;
        }
      }

      if (existsSync(packageCwd) && existsSync(join(packageCwd, "./package.json"))) {
        const packageJSON = JSON.parse(
          readFileSync(join(packageCwd, "./package.json"), "utf-8")
            .toString(),
        );
        version = packageJSON.version??'0.0.0';
      }
    }
    if (!existsSync(pluginPath)) {
      log.error(tTrace, `Plugin {name} in {package} not found`, {
        name: plugin,
        package: npmPackage ?? "self",
      });
      return Err(new Error(`Plugin ${plugin} in ${npmPackage ?? "self"} not found`));
    }

    log.debug(tTrace, `Plugin {name}: attempt to load from {path} as {pluginName}`, {
      name: plugin,
      path: pluginPath,
      pluginName: name,
    });

    const loadResult = await fromPromise(this.loadPluginFile<NamedType, ClassType>(
      pluginPath,
      name,
      packageCwd,
      version
    ));

    if (!loadResult.success) {
      log.error(tTrace, `Failed to load plugin {name}: {error}`, {
        name: plugin,
        error: loadResult.error.message,
      });
      return Err(new Error(`Failed to load plugin ${name}: ${loadResult.error.message}`));
    }

    log.info(tTrace, `Successfully loaded plugin {name}`, { name: plugin });
    return Ok(loadResult.data);
  }

  public async loadPluginFile<
    NamedType extends PluginType,
    ClassType extends PluginTypeDefinitionRef<NamedType>
  >(
    pluginPath: string,
    pluginName: string,
    packageCwd: string,
    version: string
  ): Promise<LoadedPlugin<NamedType, ClassType>> {
    let pluginFile = join(pluginPath, './index.js');

    if (this.devMode) {
      const tsPluginFile = join(pluginPath, './index.ts');
      if (existsSync(tsPluginFile)) {
        pluginFile = tsPluginFile;
      }
    }

    if (!existsSync(pluginFile)) {
      throw new Error(`Plugin ${ pluginName } not found at ${ pluginFile }`);
    }

    const pluginExports = await import(pluginFile);

    if (!pluginExports.Plugin) {
      throw new Error(`Plugin ${ pluginName } does not export a Plugin class`);
    }

    let serviceConfigDef: BSBPluginConfig<any> | null = null;
    if (pluginExports.Config) {
      serviceConfigDef = new (pluginExports.Config as typeof BSBPluginConfigRef)(
        process.cwd(),
        packageCwd,
        pluginPath,
        pluginName
      );
    }

    return {
      name: pluginName,
      ref: pluginName,
      version: version,
      serviceConfig: serviceConfigDef,
      plugin: pluginExports.Plugin,
      packageCwd: packageCwd,
      pluginCwd: pluginPath,
      pluginPath: pluginPath,
    };
  }
}
