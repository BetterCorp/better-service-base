import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  PluginType,
  PluginTypeDefinitionRef,
  IPluginLogger,
  BSBError,
  LoadedPlugin,
  BSBPluginConfig,
  BSBPluginConfigRef,
} from "../";

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
    let packageCwd = this.cwd;
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
      packageCwd = join(this.pluginDir, npmPackage);
      pluginPath = join(packageCwd, "./lib/plugins/", plugin);

      const packageJsonPath = join(packageCwd, "./package.json");
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
    let serviceConfigDef: BSBPluginConfig<any> | null = null;
    //if (this.devMode) {
    const tsPluginFile = join(pluginPath, "./plugin.ts");
    if (existsSync(tsPluginFile)) {
      log.debug("PLUGIN {pluginName} running in development mode", {
        pluginName: name,
      });
      pluginFile = tsPluginFile;
    }

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
    if (importedPlugin.Config !== undefined)
      serviceConfigDef =
        new (importedPlugin.Config as typeof BSBPluginConfigRef)(
          this.cwd,
          packageCwd,
          pluginPath,
          name
        );

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
