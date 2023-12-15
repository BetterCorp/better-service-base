import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PluginType, PluginTypeDefinitionRef } from "../interfaces/plugins";
import { IPluginLogger } from "../interfaces/logging";
import { BSBError } from "../base/errorMessages";
import {
  BSBServiceConfig,
  BSBServiceConfigRef,
  LoadedPlugin,
} from "../interfaces";

export class SBPlugins {
  protected cwd: string;
  protected pluginDir: string;
  protected devMode: boolean;

  constructor(cwd: string, devMode: boolean) {
    this.cwd = cwd;
    this.devMode = devMode;
    if (
      typeof process.env.PLUGIN_DIR == "string" &&
      process.env.PLUGIN_DIR.length > 3
    ) {
      this.pluginDir = process.env.PLUGIN_DIR;
    } else {
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
    name: string
  ): Promise<LoadedPlugin<NamedType, ClassType> | null> {
    log.debug(`PLUGIN {name} from {package} try load as {pluginName}`, {
      name: plugin,
      pluginName: name,
      package: npmPackage ?? "self",
    });
    const nodeModulesLib = npmPackage !== null;
    let pluginPath = "";
    let pluginCWD = this.cwd;
    let version = "0.0.0";
    if (!nodeModulesLib) {
      if (this.devMode) {
        pluginPath = join(this.cwd, "./src/plugins/" + plugin);
        if (!existsSync(pluginPath)) pluginPath = "";
      }
      if (pluginPath == "") {
        pluginPath = join(this.cwd, "./lib/plugins/" + plugin);
      }
    } else {
      pluginCWD = join(this.pluginDir, npmPackage);
      pluginPath = join(pluginCWD, "./lib/plugins/", plugin);

      const packageJsonPath = join(pluginCWD, "./package.json");
      const packageJSON = JSON.parse(
        readFileSync(packageJsonPath, "utf-8").toString()
      );
      version = packageJSON.version;
    }
    if (!existsSync(pluginPath)) {
      log.error(`PLUGIN {name} in {package} not found`, {
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

    let pluginFile = join(pluginPath, "./plugin.js");
    let configDefFile: string | null = null;
    let serviceConfigDef: BSBServiceConfig<any> | null = null;
    //if (this.devMode) {
    const tsPluginFile = join(pluginPath, "./plugin.ts");
    if (existsSync(tsPluginFile)) {
      log.debug("PLUGIN {pluginName} running in development mode", {
        pluginName: name,
      });
      pluginFile = tsPluginFile;
    }
    // sec-.ts
    configDefFile = join(pluginPath, "./sec-config.js");
    const tsInstallerFile = join(pluginPath, "./sec-config.ts");
    if (existsSync(tsInstallerFile)) {
      log.debug("PLUGIN {pluginName} running development mode installer", {
        pluginName: name,
      });
      configDefFile = tsInstallerFile;
    } else if (!existsSync(configDefFile)) {
      log.debug("PLUGIN {pluginName} does not have an installer file", {
        pluginName: name,
      });
      configDefFile = null;
    } else {
      log.debug("PLUGIN {pluginName} does not have an installer file", {
        pluginName: name,
      });
    }

    if (configDefFile !== null) {
      const importedConfig = await import(configDefFile);
      if (importedConfig.Config === undefined)
        throw new BSBError(
          "PLUGIN {pluginName} sec-config.ts/js does not export a Config class - so possibly not a valid BSB Plugin Config",
          {
            pluginName: name,
          }
        );
      serviceConfigDef =
        new (importedConfig.Config as typeof BSBServiceConfigRef)(
          this.cwd,
          pluginCWD,
          name
        );
    }
    //}

    if (!existsSync(pluginFile))
      throw new BSBError("PLUGIN {pluginName} not found at {location}", {
        pluginName: name,
        location: pluginFile,
      });

    const importedPlugin = await import(pluginFile);

    if (importedPlugin.Plugin === undefined)
      throw new BSBError(
        "PLUGIN {pluginName} does not export a Plugin class - so possibly not a valid BSB Plugin",
        {
          pluginName: name,
        }
      );

    return {
      name: name,
      ref: plugin,
      version: version,
      serviceConfig: serviceConfigDef,
      plugin: importedPlugin.Plugin,
      pluginCWD: pluginCWD,
      pluginPath: pluginPath,
    };
  }
}
