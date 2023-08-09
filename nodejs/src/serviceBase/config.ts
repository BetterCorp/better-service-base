import { Tools } from "@bettercorp/tools/lib/Tools";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PluginDefinitions, IReadyPlugin, PluginDefinition } from "../interfaces/service";
import { IPluginLogger } from "../interfaces/logger";
import { ConfigBase } from "../config/config";
import { SecConfig } from "../interfaces/serviceConfig";
import { SBBase } from "./base";

export class SBConfig {
  private log: IPluginLogger;
  private cwd!: string;
  private configPlugin!: {
    plugin: IReadyPlugin;
    deploymentProfile: string;
  };
  public appConfig!: ConfigBase;
  constructor(log: IPluginLogger, cwd: string) {
    this.log = log;
    this.cwd = cwd;
  }

  public dispose() {
    this.appConfig.dispose();
  }

  public async findConfigPlugin(plugins: Array<IReadyPlugin>): Promise<void> {
    let deploymentProfile = "default";
    if (!Tools.isNullOrUndefined(process.env.BSB_PROFILE)) {
      deploymentProfile = process.env.BSB_PROFILE!;
    }

    await this.log.info(
      "config load with profile: {deploymentProfile}, against {len} plugins",
      {
        deploymentProfile,
        len: plugins.length,
      }
    );
    let pluginName = "config-default";
    if (
      (!Tools.isNullOrUndefined(process.env.BSB_CONFIG_PLUGIN) &&
        process.env.BSB_CONFIG_PLUGIN !== "") ||
      existsSync(join(this.cwd, "./BSB_CONFIG_PLUGIN"))
    ) {
      pluginName =
        process.env.BSB_CONFIG_PLUGIN ||
        readFileSync(join(this.cwd, "./BSB_CONFIG_PLUGIN")).toString() ||
        "config-default";
    }
    await this.log.info(`PLUGIN {pluginName} check`, {
      pluginName,
    });
    for (const plugin of plugins) {
      if (plugin.pluginDefinition === PluginDefinitions.config) {
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

  public async mapPlugins(
    _plugins: Array<IReadyPlugin>
  ): Promise<Array<IReadyPlugin>> {
    let mappedPlugins: Array<IReadyPlugin> = [];

    for (let plugin of _plugins) {
      if (plugin.pluginDefinition !== PluginDefinitions.config) continue;
      if (plugin.name !== this.configPlugin.plugin.name) continue;
      mappedPlugins.push(plugin);
    }

    for (let plugin of _plugins) {
      if (
        plugin.pluginDefinition === PluginDefinitions.config ||
        plugin.pluginDefinition === PluginDefinitions.service
      )
        continue;
      //if (!await this.appConfig.getAppPluginState(plugin.name)) continue;
      plugin.mappedName = await this.appConfig.getAppPluginMappedName(
        plugin.name
      );
      mappedPlugins.push(plugin);
    }

    for (let plugin of _plugins) {
      if (plugin.pluginDefinition !== PluginDefinitions.service) continue;
      if (!(await this.appConfig.getAppPluginState(plugin.name))) continue;
      plugin.mappedName = await this.appConfig.getAppPluginMappedName(
        plugin.name
      );
      mappedPlugins.push(plugin);
    }

    return mappedPlugins;
  }

  public async findPluginByType(
    plugins: Array<IReadyPlugin>,
    defaultPlugin: string,
    type: PluginDefinition
  ): Promise<IReadyPlugin> {
    for (const plugin of plugins) {
      if (plugin.pluginDefinition === type) {
        if (await this.appConfig.getAppPluginState(plugin.name)) return plugin;
      }
    }
    for (const plugin of plugins) {
      if (plugin.name === defaultPlugin) {
        return plugin;
      }
    }
    await this.log.fatal(
      "Cannot find plugin type {type} or default {defaultPlugin}",
      {
        type,
        defaultPlugin,
      }
    );
    return undefined as any; // should not reach this
  }

  public getPluginName(): string {
    return this.configPlugin.plugin.name;
  }

  public async setupConfigPlugin(
    logger: IPluginLogger,
    appId: string,
    runningDebug: boolean,
    runningLive: boolean,
    plugins: Array<IReadyPlugin>
  ): Promise<void> {
    let appConfig: ConfigBase | undefined = undefined;

    await this.log.debug(`Import config plugin: {name} from {file}`, {
      name: this.configPlugin.plugin.name,
      file: this.configPlugin.plugin!.pluginFile,
    });
    const importedPlugin = await import(this.configPlugin.plugin!.pluginFile);

    await this.log.debug(`Construct config plugin: {name}`, {
      name: this.configPlugin.plugin.name,
    });

    appConfig = new (importedPlugin.Config as unknown as typeof ConfigBase)(
      this.configPlugin.plugin.mappedName,
      this.cwd,
      this.configPlugin.plugin.pluginDir,
      logger,
      this.configPlugin.deploymentProfile
    );
    await this.log.debug(`Create config plugin: {name}`, {
      name: this.configPlugin.plugin.name,
    });

    let pluginInstaller: SecConfig<any> | null =
      await this.ImportAndCreatePluginConfig(this.configPlugin.plugin);
    let pluginConfig = {};
    if (pluginInstaller !== null) {
      pluginConfig = pluginInstaller.migrate(
        this.configPlugin.plugin.name,
        pluginConfig
      );
    }

    SBBase.setupPlugin(appId, runningDebug, runningLive, appConfig, {
      getAppMappedPluginConfig: async () => {
        return pluginConfig;
      },
      getAppMappedPluginState: async () => {
        return true;
      },
    } as any);
    await appConfig.createAppConfig(plugins.map((x) => x.name));
    this.appConfig = appConfig!;
    await appConfig.init();
    await this.log.info(`Config plugin ready: {name}`, {
      name: this.configPlugin.plugin.name,
    });
  }

  public async ImportAndMigratePluginConfig(plugin: IReadyPlugin) {
    let existingConfig = await this.appConfig.getAppMappedPluginConfig(
      plugin.mappedName
    );
    let secConfig = await this.ImportAndCreatePluginConfig(plugin);
    let config =
      secConfig !== null
        ? secConfig.migrate(plugin.mappedName, existingConfig || {})
        : {};
    await this.appConfig.migrateAppPluginConfig(
      plugin.name,
      plugin.mappedName,
      config
    );
    return config;
  }

  private async ImportAndCreatePluginConfig(
    plugin: IReadyPlugin
  ): Promise<SecConfig | null> {
    let config: SecConfig | null = null;

    if (plugin.installerFile !== null && existsSync(plugin.installerFile)) {
      await this.log.debug(
        `Import plugin config (sec.config.ts/js): {name} -> {installerFile}`,
        {
          name: plugin.name,
          installerFile: plugin.installerFile,
        }
      );
      const importedInstaller = await import(plugin.installerFile);
      await this.log.debug(`Create plugin config (sec.config.ts/js): {name}`, {
        name: plugin.name,
      });
      config = new (importedInstaller.Config as unknown as typeof SecConfig)();
    } else {
      await this.log.debug(`No plugin config (sec.config.ts/js): {name}`, {
        name: plugin.name,
      });
    }
    return config;
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
