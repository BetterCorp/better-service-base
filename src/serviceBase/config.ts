import { Tools } from "@bettercorp/tools/lib/Tools";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { IPluginDefinition, IReadyPlugin } from "../interfaces/plugin";
import { IPluginLogger } from "../interfaces/logger";
import { ConfigBase } from "../config/config";

export class SBConfig {
  private log: IPluginLogger;
  private cwd!: string;
  private configPlugin!: {
    plugin: IReadyPlugin;
    deploymentProfile: string;
  };
  public appConfig!: ConfigBase;
  constructor(log: IPluginLogger) {
    this.log = log;
  }

  public async findConfigPlugin(
    plugins: Array<IReadyPlugin>,
    cwd: string
  ): Promise<void> {
    this.cwd = cwd;
    let deploymentProfile = "default";
    if (!Tools.isNullOrUndefined(process.env.BSB_PROFILE)) {
      deploymentProfile = process.env.BSB_PROFILE!;
    }

    this.log.info(
      "config load with profile: {deploymentProfile} against {len} plugins",
      {
        deploymentProfile,
        len: plugins.length,
      }
    );
    let pluginName = "config-default";
    if (
      (!Tools.isNullOrUndefined(process.env.BSB_CONFIG_PLUGIN) &&
        process.env.BSB_CONFIG_PLUGIN !== "") ||
      existsSync(join(cwd, "./BSB_CONFIG_PLUGIN"))
    ) {
      pluginName =
        process.env.BSB_CONFIG_PLUGIN ||
        readFileSync(join(cwd, "./BSB_CONFIG_PLUGIN")).toString() ||
        "config-default";
    }
    await this.log.info(`PLUGIN {pluginName} check`, {
      pluginName,
    });
    for (const plugin of plugins) {
      if (plugin.pluginDefinition === IPluginDefinition.config) {
        if (pluginName !== plugin.name) continue;
        await this.log.info(`PLUGIN {name}v{version}`, {
          name: plugin.name,
          version: plugin.version,
        });
        this.configPlugin = {
          deploymentProfile,
          plugin,
        };
        await this.log.info(`PLUGIN {name}v{version} [SETUP FOR CONFIG]`, {
          name: plugin!.name,
          version: plugin.version,
        });
        return;
      }
    }

    await this.log.fatal("Unable to setup default config plugin.");
  }

  public getPluginName(): string {
    return this.configPlugin.plugin.name;
  }

  public async setupConfigPlugin(logger: IPluginLogger): Promise<ConfigBase> {
    let appConfig: ConfigBase | undefined = undefined;

    await this.log.debug(`Import config plugin: {name}`, {
      name: this.configPlugin.plugin.name,
    });
    const importedPlugin = await import(this.configPlugin.plugin!.pluginFile);
    
    await this.log.debug(`Construct config plugin: {name}`, {
      name: this.configPlugin.plugin.name,
    });

    appConfig = new (importedPlugin.Config as unknown as typeof ConfigBase)(
      logger,
      this.cwd,
      this.configPlugin.deploymentProfile
    );
    await this.log.debug(`Refresh config plugin: {name}`, {
      name: this.configPlugin.plugin.name,
    });

    await appConfig!.refreshAppConfig();
    this.appConfig = appConfig!;
    await this.log.info(`config plugin ready: {name}`, {
      name: this.configPlugin.plugin.name,
    });
    return appConfig!;
  }

  /*public async configAllPlugins(): Promise<void> {
    await this._coreLogger.info(`CONFIG: {length} plugins`, {
      length: this._plugins.length,
    });
    for (const plugin of this._plugins) {
      if (plugin.pluginDefinition === IPluginDefinition.config) continue;
      const mappedPlugin = await this._appConfig.getMappedPluginName(
        plugin.name
      );
      await this._coreLogger.info(
        `CONFIG: PLUGIN {name}v{version} AS {mappedPlugin}`,
        { name: plugin.name, version: plugin.version, mappedPlugin }
      );
      this.getReadyPluginConfig(plugin.pluginDefinition, plugin, mappedPlugin);
      await this._coreLogger.info(
        `CONFIG: PLUGIN {name}v{version} [CONFIGURED]`,
        { name: plugin!.name, version: plugin.version }
      );
    }
  }*/
}
