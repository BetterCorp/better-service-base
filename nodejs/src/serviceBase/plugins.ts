import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  PluginType,
  PluginTypeDefinitionRef,
  IPluginLogger,
  LoadedPlugin,
  BSBPluginConfigRef,
  BSBPluginConfig,
} from "../";

export class SBPlugins {
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
        throw new Error(`Plugin directory ${process.env.BSB_PLUGIN_DIR} does not exist`);
      }
      this.referencedPluginDir = process.env.BSB_PLUGIN_DIR;
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
    let version = "1.0.0";
    if (!nodeModulesLib) {
      // If no package is defined in the config, we will not look anywhere else except for the local plugins
      if (this.devMode) {
        pluginPath = join(this.cwd, "./src/plugins/" + plugin);
        if (!existsSync(pluginPath)) pluginPath = "";
      }
      if (pluginPath == "") {
        pluginPath = join(this.cwd, "./lib/plugins/" + plugin);
      }
    } else {
      // If a package is defined in the config, we will look for the plugin in the BSB_PLUGIN_DIR env, followed by the node_modules directory. Local plugins are not used.
      if (this.referencedPluginDir) {
        pluginPath = join(this.referencedPluginDir, npmPackage, version, "./lib/plugins/" + plugin);
        if (!existsSync(pluginPath)) pluginPath = "";
        pluginPath = join(this.referencedPluginDir, npmPackage, "latest", "./lib/plugins/" + plugin);
        if (!existsSync(pluginPath)) pluginPath = "";
      }
      if (pluginPath == '') pluginPath = join(this.nodeModulesPluginDir, npmPackage, "./lib/plugins/" + plugin);
      if (!existsSync(pluginPath)) pluginPath = "";

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

    try {
      return await this.loadPluginFile(
        pluginPath,
        name,
        packageCwd,
        version
      );
    } catch (error) {
      log.error(`Failed to load plugin {name}: {error}`, {
        name: plugin,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
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
      throw new Error(`Plugin ${pluginName} not found at ${pluginFile}`);
    }

    const pluginExports = await import(pluginFile);

    if (!pluginExports.Plugin) {
      throw new Error(`Plugin ${pluginName} does not export a Plugin class`);
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
