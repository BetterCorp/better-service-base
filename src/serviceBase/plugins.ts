import { readdirSync, statSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { Tools } from "@bettercorp/tools/lib/Tools";
import { IDictionary } from "@bettercorp/tools/lib/Interfaces";
import { ILogger, IPluginLogger } from "../interfaces/logger";
import { IConfig } from "../interfaces/config";
import { IEvents } from "../interfaces/events";
import {
  IPlugin,
  IPluginDefinition,
  IReadyPlugin,
} from "../interfaces/plugin";
import { DefaultConfig } from "../config/config";
import { Events } from "../events/events";
import { Readable } from "stream";
import { Logger } from "../logger/logger";

export class Plugins {
  private _cwd: string;
  private _coreLogger: IPluginLogger;
  private _appConfig!: IConfig;
  private _loadedPlugins: IDictionary<IPlugin> = {};
  private _plugins: Array<IReadyPlugin> = [];
  private _logger: ILogger;
  private _loggerName = "log";
  private _events: IEvents;
  private _eventsName = "events";
  private _fatalHandler: { (): Promise<void> };

  constructor(
    coreLogger: IPluginLogger,
    cwd: string,
    fatalHandler: { (): Promise<void> }
  ) {
    this._fatalHandler = fatalHandler;
    this._cwd = cwd;
    this._coreLogger = coreLogger;
    this._logger = new Logger(this._loggerName, this._cwd, this._coreLogger, {
      runningInDebug: process.env.DEBUG === "true",
      runningLive: process.env.LIVE === "true",
    } as any);
    this._events = new Events(this._eventsName, this._cwd, this._logger, {
      runningInDebug: true,
    } as any);
  }

  private getPluginType(name: string): IPluginDefinition {
    const pluginLow = name.toLowerCase();
    if (pluginLow.indexOf("config-") === 0) return IPluginDefinition.config;
    if (pluginLow.indexOf("events-") === 0) return IPluginDefinition.events;
    if (pluginLow.indexOf("log-") === 0 || pluginLow.indexOf("logs-") === 0)
      return IPluginDefinition.logging;
    return IPluginDefinition.normal;
  }

  private async findPluginsFiles(
    path: string,
    version: string,
    libOnly = false
  ): Promise<Array<IReadyPlugin>> {
    const arrOfPlugins: Array<IReadyPlugin> = [];

    await this._coreLogger.debug(`FIND: FIND plugins in [{path}]`, { path });
    for (const dirPluginFolderName of readdirSync(path)) {
      const thisFullPath = join(path, dirPluginFolderName);
      if (!statSync(thisFullPath).isDirectory()) {
        await this._coreLogger.debug(
          `FIND: IGNORE [{thisFullPath}] Not a DIR`,
          { thisFullPath }
        );
        continue;
      }
      if (dirPluginFolderName.indexOf("-") === 0) {
        await this._coreLogger.debug(
          `FIND: IGNORE [{thisFullPath}] Defined disabled`,
          { thisFullPath }
        );
        continue;
      }
      if (libOnly) {
        if (dirPluginFolderName.indexOf("-test") >= 0) {
          await this._coreLogger.debug(
            `FIND: IGNORE [{thisFullPath}] Defined test plugin to ignore`,
            { thisFullPath }
          );
          continue;
        }
      }
      let pluginFile = join(thisFullPath, "plugin.ts");
      if (!existsSync(pluginFile)) pluginFile = join(thisFullPath, "plugin.js");

      if (!existsSync(pluginFile)) {
        await this._coreLogger.debug(
          `FIND: IGNORE [{thisFullPath}] Not a valid plugin`,
          { thisFullPath }
        );
        continue;
      }

      let pluginInstallerFile: string | null = join(
        thisFullPath,
        "sec.config.js"
      );
      //if (!existsSync(pluginInstallerFile))
      //  pluginInstallerFile = join(thisFullPath, "sec.config.js");

      if (!existsSync(pluginInstallerFile)) pluginInstallerFile = null;

      await this._coreLogger.debug(
        `FIND: READY [{dirPluginFolderName}] in: {thisFullPath}`,
        { dirPluginFolderName, thisFullPath }
      );
      arrOfPlugins.push({
        pluginDefinition: this.getPluginType(dirPluginFolderName),
        name: dirPluginFolderName,
        version,
        pluginFile,
        installerFile: pluginInstallerFile,
      });
    }

    return arrOfPlugins;
  }
  private async findPluginsInBase(
    path: string,
    libOnly = false
  ): Promise<Array<IReadyPlugin>> {
    const pluginJson = JSON.parse(
      readFileSync(join(path, "./package.json"), "utf8").toString()
    );
    if (pluginJson.bsb_project !== true) {
      await this._coreLogger.debug("FIND: IGNORE AS NOT BSB PROJECT");
      return [];
    }

    let innerPluginLib = join(path, "./src");
    if (
      libOnly ||
      !existsSync(innerPluginLib) ||
      !statSync(innerPluginLib).isDirectory()
    ) {
      innerPluginLib = join(path, "./lib");
    }
    if (
      !existsSync(innerPluginLib) ||
      !statSync(innerPluginLib).isDirectory()
    ) {
      await this._coreLogger.debug(
        `FIND: IGNORE [{innerPluginLib}] No src/lib dir in package`,
        { innerPluginLib }
      );
      return [];
    }
    const innerPluginLibPlugin = join(innerPluginLib, "./plugins");
    if (
      !existsSync(innerPluginLibPlugin) ||
      !statSync(innerPluginLibPlugin).isDirectory()
    ) {
      await this._coreLogger.debug(
        `FIND: IGNORE [{innerPluginLibPlugin}] No inner plugins dir`,
        { innerPluginLibPlugin }
      );
      return [];
    }

    const packageVersion = pluginJson.version;
    return await this.findPluginsFiles(
      innerPluginLibPlugin,
      packageVersion,
      libOnly
    );
  }
  private async findNPMPlugins(
    cwd: string = this._cwd
  ): Promise<Array<IReadyPlugin>> {
    let arrOfPlugins: Array<IReadyPlugin> = [];

    const npmPluginsDir = join(cwd, "./node_modules");
    await this._coreLogger.debug(`FIND: NPM plugins in: {npmPluginsDir}`, {
      npmPluginsDir,
    });
    if (!existsSync(npmPluginsDir)) {
      await this._coreLogger.error(
        `FIND: NPM plugins dir does not exist: {npmPluginsDir}`,
        { npmPluginsDir }
      );
      return [];
    }
    for (const dirFileWhat of readdirSync(npmPluginsDir)) {
      try {
        const pluginPath = join(npmPluginsDir, dirFileWhat);
        if (dirFileWhat.indexOf(".") === 0) {
          continue;
        }
        if (dirFileWhat.indexOf("@") === 0) {
          await this._coreLogger.debug(
            `FIND: GROUP [{dirFileWhat}] {pluginPath}`,
            { dirFileWhat, pluginPath }
          );
          for (const groupPluginName of readdirSync(pluginPath)) {
            if (groupPluginName.indexOf(".") === 0) {
              continue;
            }
            const groupPluginPath = join(pluginPath, groupPluginName);
            await this._coreLogger.debug(
              `FIND: CHECK [{dirFileWhat}/{groupPluginName}] {groupPluginPath}`,
              { dirFileWhat, groupPluginName, groupPluginPath }
            );
            if (statSync(groupPluginPath).isDirectory()) {
              arrOfPlugins = arrOfPlugins.concat(
                await this.findPluginsInBase(groupPluginPath, true)
              );
            }
          }
        } else {
          await this._coreLogger.debug(
            `FIND: CHECK [{dirFileWhat}] {pluginPath}`,
            { dirFileWhat, pluginPath }
          );
          if (statSync(pluginPath).isDirectory()) {
            arrOfPlugins = arrOfPlugins.concat(
              await this.findPluginsInBase(pluginPath, true)
            );
          }
        }
      } catch (err: any) {
        await this._coreLogger.error("{message}", {
          message: err.message || err.toString(),
        });
      }
    }

    return arrOfPlugins;
  }
  private async findLocalPlugins(): Promise<Array<IReadyPlugin>> {
    return await this.findPluginsInBase(this._cwd);
  }
  public async findAllPlugins(): Promise<void> {
    if (process.env.BSB_CONTAINER == "true") {
      await this._coreLogger.info(
        "NOTE: RUNNING IN BSB CONTAINER - PLUGIN LOCATION ALTERED"
      );
      await this._coreLogger.info("FIND: findAllPlugins");
      this._plugins = [];
      for (let dir of (process.env.BSB_PLUGIN_DIR || "").split(",")) {
        await this._coreLogger.info("FIND: findAllPlugins: {dir}", { dir });
        this._plugins = this._plugins.concat(await this.findNPMPlugins(dir));
      }
      await this._coreLogger.info(`FIND: {length} plugins found`, {
        length: this._plugins.length,
      });
      if (this._plugins.length > 0) return;
      await this._coreLogger.warn(
        `FIND: Reverting to node_modules and local search!`
      );
    }
    await this._coreLogger.info("FIND: findAllPlugins");
    this._plugins = (await this.findNPMPlugins()).concat(
      await this.findLocalPlugins()
    );
    await this._coreLogger.info(`FIND: {length} plugins found`, {
      length: this._plugins.length,
    });
  }

  private async loadPluginConfig(
    name: string,
    mappedPluginName: string,
    path: string
  ): Promise<void> {
    await this._coreLogger.debug(`LOAD P CONFIG: {name}`, { name });
    let loadedFile = require(path); // eslint-disable-line @typescript-eslint/no-var-requires
    if (loadedFile.default !== undefined) loadedFile = loadedFile.default;
    await this._coreLogger.debug(`LOAD P CONFIG: {name} Ready`, { name });
    const tPConfig = Tools.mergeObjects(
      loadedFile(
        mappedPluginName,
        await this._appConfig.getPluginConfig(mappedPluginName)
      ),
      await this._appConfig.getPluginConfig(mappedPluginName)
    );
    await this._coreLogger.debug(`LOAD P CONFIG: {name} Update app config`, {
      name,
    });
    await this._appConfig.updateAppConfig(name, mappedPluginName, tPConfig);
    await this._coreLogger.debug(`LOAD P CONFIG: {name} Complete`, { name });
  }

  private async getReadyPluginConfig(
    definition: IPluginDefinition,
    plugin: IReadyPlugin,
    mappedPluginName: string
  ): Promise<void> {
    if (definition === IPluginDefinition.config) return;

    await this._coreLogger.debug(
      `READY: {name} AS {mappedPluginName} [{definition}]`,
      { name: plugin.name, mappedPluginName, definition }
    );
    if (!Tools.isNullOrUndefined(this._loadedPlugins[plugin.name])) {
      await this._coreLogger.fatal(
        `Cannot have 2 plugins with the same name!! [{name}]`,
        { name: plugin.name }
      );
      await this._fatalHandler();
    }

    await this._coreLogger.debug(`READY: {name} Installer`, {
      name: plugin.name,
    });
    if (plugin.installerFile !== null) {
      await this._coreLogger.debug(
        `READY: {name} Installer from {installerFile}`,
        { name: plugin.name, installerFile: plugin.installerFile }
      );
      this.loadPluginConfig(
        plugin.name,
        mappedPluginName,
        plugin.installerFile
      );
    } else {
      await this._coreLogger.debug(`READY: {name} Installer as {}`, {
        name: plugin.name,
      });
      await this._appConfig.updateAppConfig(plugin.name, mappedPluginName);
    }
    await this._coreLogger.debug(`READY: {name} Installer Complete`, {
      name: plugin.name,
    });
  }

  private async getReadyToLoadPlugin(
    plugin: IReadyPlugin,
    mappedPluginName: string
  ): Promise<IConfig | IPlugin | ILogger | IEvents> {
    this.getReadyPluginConfig(
      plugin.pluginDefinition,
      plugin,
      mappedPluginName
    );

    await this._coreLogger.debug(`READY: {name}v{version} Import`, {
      name: plugin.name,
      version: plugin.version,
    });
    const importedPlugin = await import(plugin.pluginFile);
    await this._coreLogger.debug(`READY: {name}v{version} Create instance`, {
      name: plugin.name,
      version: plugin.version,
    });
    switch (plugin.pluginDefinition) {
      case IPluginDefinition.config:
        if (Tools.isNullOrUndefined(importedPlugin.Config)) {
          await this._coreLogger.fatal(`Cannot find Config in {name}`, {
            name: plugin.name,
          });
          await this._fatalHandler();
        }
        return importedPlugin.Config;
      case IPluginDefinition.events:
        if (Tools.isNullOrUndefined(importedPlugin.Events)) {
          await this._coreLogger.fatal(`Cannot find Events in {name}`, {
            name: plugin.name,
          });
          await this._fatalHandler();
        }
        return importedPlugin.Events;
      case IPluginDefinition.logging:
        if (Tools.isNullOrUndefined(importedPlugin.Logger)) {
          await this._coreLogger.fatal(`Cannot find Logger in {name}`, {
            name: plugin.name,
          });
          await this._fatalHandler();
        }
        return importedPlugin.Logger;
      default:
        if (Tools.isNullOrUndefined(importedPlugin.Plugin)) {
          await this._coreLogger.fatal(`Cannot find Plugin in {name}`, {
            name: plugin.name,
          });
          await this._fatalHandler();
        }
        return importedPlugin.Plugin;
    }
  }

  public async setupConfigPlugin(): Promise<void> {
    let deploymentProfile = "default";
    if (!Tools.isNullOrUndefined(process.env.BSB_PROFILE)) {
      deploymentProfile = process.env.BSB_PROFILE!;
    }

    if (
      (!Tools.isNullOrUndefined(process.env.BSB_CONFIG_PLUGIN) &&
        process.env.BSB_CONFIG_PLUGIN !== "") ||
      existsSync(join(this._cwd, "./BSB_CONFIG_PLUGIN"))
    ) {
      const pluginName =
        process.env.BSB_CONFIG_PLUGIN ||
        readFileSync(join(this._cwd, "./BSB_CONFIG_PLUGIN")).toString();
      await this._coreLogger.info(`APP_CONFIG: PLUGIN {pluginName} check`, {
        pluginName,
      });
      for (const plugin of this._plugins) {
        if (plugin.pluginDefinition === IPluginDefinition.config) {
          if (pluginName !== plugin.name) continue;
          await this._coreLogger.info(`APP_CONFIG: PLUGIN {name}v{version}`, {
            name: plugin.name,
            version: plugin.version,
          });
          const configPlugin = (await this.getReadyToLoadPlugin(
            plugin,
            plugin.name
          )) as any;
          this._appConfig = new configPlugin(
            this._defaultLogger,
            this._cwd,
            deploymentProfile
          );
          await this._coreLogger.info(
            `APP_CONFIG: PLUGIN {name}v{version} [CONFIGURED]`,
            { name: plugin!.name, version: plugin.version }
          );
        }
      }
    }

    if (Tools.isNullOrUndefined(this._appConfig)) {
      await this._coreLogger.info(`APP_CONFIG: PLUGIN default config loader`);
      this._appConfig = new DefaultConfig(
        this._defaultLogger,
        this._cwd,
        deploymentProfile
      );
      await this._coreLogger.info(`APP_CONFIG: PLUGIN default [CONFIGURED]`);
    }

    await this._appConfig.refreshAppConfig();
  }
  public async configAllPlugins(): Promise<void> {
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
  }

  public async constructAllPlugins(): Promise<void> {
    await this._coreLogger.info("CONSTRUCT: constructAllPlugins");
    for (const plugin of this._plugins) {
      if (plugin.pluginDefinition === IPluginDefinition.config) continue;
      const mappedPluginName = await this._appConfig.getMappedPluginName(
        plugin.name
      );
      await this._appConfig.updateAppConfig(plugin.name, mappedPluginName);
    }
    await this._coreLogger.info(`CONSTRUCT: {length} plugins`, {
      length: this._plugins.length,
    });
    let logger: IReadyPlugin;
    let events: IReadyPlugin;
    for (const plugin of this._plugins) {
      if (plugin.pluginDefinition !== IPluginDefinition.logging) {
        continue;
      }
      if (!(await this._appConfig.getPluginState(plugin.name))) {
        continue;
      }
      await this._coreLogger.info(
        `CONSTRUCT: LOGGER {name}v{version} [LOADED]`,
        {
          name: plugin.name,
          version: plugin.version,
        }
      );
      logger = plugin;
      break;
    }
    for (const plugin of this._plugins) {
      if (plugin.pluginDefinition !== IPluginDefinition.events) {
        continue;
      }
      if (!(await this._appConfig.getPluginState(plugin.name))) {
        continue;
      }
      await this._coreLogger.info(
        `CONSTRUCT: EVENTS {name}v{version} [LOADED]`,
        { name: plugin.name, version: plugin.version }
      );
      events = plugin;
      break;
    }

    // (pluginName: string, cwd: string, log: IPluginLogger, appConfig: AppConfig)
    if (!Tools.isNullOrUndefined(logger!)) {
      const mappedPlugin = await this._appConfig.getMappedPluginName(
        logger!.name
      );
      await this._coreLogger.info(
        `CONSTRUCT: {name} AS {mappedPlugin} [LOGGER]`,
        { name: logger!.name, mappedPlugin }
      );
      const readToLoadPlugin = await this.getReadyToLoadPlugin(
        logger!,
        mappedPlugin
      );
      this._logger = new (readToLoadPlugin as any)(
        mappedPlugin,
        this._cwd,
        this._defaultLogger,
        this._appConfig
      );
    }
    const self = this;
    if (!Tools.isNullOrUndefined(events!)) {
      const mappedPlugin = await this._appConfig.getMappedPluginName(
        events!.name
      );
      await this._coreLogger.info(
        `CONSTRUCT: {name} AS {mappedPlugin} [EVENTS]`,
        { name: events!.name, mappedPlugin }
      );
      const readToLoadPlugin = await this.getReadyToLoadPlugin(
        events!,
        mappedPlugin
      );
      this._events = new (readToLoadPlugin as any)(
        mappedPlugin,
        this._cwd,
        {
          info: (...data: any[]): Promise<void> =>
            self._logger.error(mappedPlugin, ...data),
          warn: (...data: any[]): Promise<void> =>
            self._logger.error(mappedPlugin, ...data),
          error: (...data: any[]): Promise<void> =>
            self._logger.error(mappedPlugin, ...data),
          fatal: async (...data: any[]): Promise<void> => {
            await self._logger.fatal(mappedPlugin, ...data);
            await this._fatalHandler();
          },
          debug: (...data: any[]): Promise<void> =>
            self._logger.error(mappedPlugin, ...data),
        },
        this._appConfig
      );
    }
    for (const plugin of this._plugins) {
      if (plugin.pluginDefinition !== IPluginDefinition.normal) continue;
      await this._coreLogger.info(`CONSTRUCT: PLUGIN {name} [CHECK]`, {name: plugin!.name});
      if (!(await this._appConfig.getPluginState(plugin.name))) {
        await this._coreLogger.info(
          `CONSTRUCT: PLUGIN {name} [DISABLED]`,
          {name: plugin!.name}
        );
        continue;
      }
      const mappedPlugin = await this._appConfig.getMappedPluginName(
        plugin.name
      );
      await this._coreLogger.info(
        `CONSTRUCT: PLUGIN {name}v{version} AS {mappedPlugin}`,
        {name: plugin.name, version: plugin.version, mappedPlugin}
      );
      const readToLoadPlugin = await this.getReadyToLoadPlugin(
        plugin,
        mappedPlugin
      );
      await this._coreLogger.info(
        `CONSTRUCT: PLUGIN {name}v{version} Render`,
        {name: plugin.name, version: plugin.version}
      );
      this._loadedPlugins[plugin.name] = new (readToLoadPlugin as any)(
        mappedPlugin,
        this._cwd,
        {
          info: (...data: any[]): Promise<void> =>
            self._logger.error(mappedPlugin, ...data),
          warn: (...data: any[]): Promise<void> =>
            self._logger.error(mappedPlugin, ...data),
          error: (...data: any[]): Promise<void> =>
            self._logger.error(mappedPlugin, ...data),
          fatal: async (...data: any[]): Promise<void> => {
            await self._logger.fatal(mappedPlugin, ...data);
            await this._fatalHandler();
          },
          debug: (...data: any[]): Promise<void> =>
            self._logger.error(mappedPlugin, ...data),
        },
        this._appConfig
      );
      await this._coreLogger.info(`CONSTRUCT: PLUGIN ${plugin!.name} [LOADED]`);
    }
    await this._coreLogger.info(
      `CONSTRUCTED: [{loadedPlugins}]`,
      {loadedPlugins: Object.keys(this._loadedPlugins)}
    );
  }

  public async setupEventsAllPlugins(): Promise<void> {
    const self = this;
    self._coreLogger.info("SETUP: setupEventsAllPlugins");
    const pluginsToInit = Object.keys(self._loadedPlugins);

    for (const plugin of pluginsToInit) {
      self._coreLogger.info(`SETUP: ${plugin}`);
      const mappedPlugin = await this._appConfig.getMappedPluginName(plugin);
      self._loadedPlugins[plugin].onEvent = async <T = any>(
        pluginName: string,
        event: string,
        listener: { (data: T): Promise<void> }
      ): Promise<void> => {
        return self._events.onEvent<T>(
          mappedPlugin,
          await this._appConfig.getMappedPluginName(pluginName || plugin),
          event,
          listener
        );
      };
      self._loadedPlugins[plugin].onReturnableEvent = async <
        ArgsDataType = any,
        ReturnDataType = any
      >(
        pluginName: string,
        event: string,
        listener: { (data?: ArgsDataType): Promise<ReturnDataType> }
      ): Promise<void> => {
        return self._events.onReturnableEvent<ArgsDataType, ReturnDataType>(
          mappedPlugin,
          await this._appConfig.getMappedPluginName(pluginName || plugin),
          event,
          listener
        );
      };
      self._loadedPlugins[plugin].emitEvent = async <T = any>(
        pluginName: string,
        event: string,
        data?: T
      ): Promise<void> => {
        return self._events.emitEvent<T>(
          mappedPlugin,
          await this._appConfig.getMappedPluginName(pluginName || plugin),
          event,
          data
        );
      };
      self._loadedPlugins[plugin].emitEventAndReturn = async <
        T1 = any,
        T2 = any
      >(
        pluginName: string,
        event: string,
        data?: T1,
        timeoutSeconds?: number
      ): Promise<T2> => {
        return self._events.emitEventAndReturn<T1, T2>(
          mappedPlugin,
          await this._appConfig.getMappedPluginName(pluginName || plugin),
          event,
          data,
          timeoutSeconds
        );
      };
      self._loadedPlugins[plugin].receiveStream = async (
        listener: { (error: Error | null, stream: Readable): Promise<void> },
        timeoutSeconds?: number
      ): Promise<string> => {
        return self._events.receiveStream(
          mappedPlugin,
          listener,
          timeoutSeconds
        );
      };
      self._loadedPlugins[plugin].sendStream = async (
        streamId: string,
        stream: Readable
      ): Promise<void> => {
        return self._events.sendStream(mappedPlugin, streamId, stream);
      };
      self._loadedPlugins[plugin].initForPlugins = async <
        ArgsDataType = any,
        ReturnDataType = void
      >(
        pluginName: string,
        initType: string,
        ...args: Array<ArgsDataType>
      ): Promise<ReturnDataType> => {
        if (pluginsToInit.indexOf(pluginName) < 0) {
          throw `Please install and enable the plugin ${pluginName} to be able to init for it.`;
        }
        if (Tools.isNullOrUndefined(self._loadedPlugins[pluginName])) {
          throw `Plugin reference error: ${pluginName}`;
        }

        if (
          typeof (self._loadedPlugins[pluginName] as any)[initType] !==
          "function"
        )
          throw `The plugin ${pluginName} does not have a method ${initType}... [${Object.keys(
            self._loadedPlugins[pluginName] as any
          ).join(",")}]`;

        return new Promise((resolve, reject) => {
          self._coreLogger.info(`SETUP: ${pluginName} INIT WITH ${initType}`);
          (self._loadedPlugins[pluginName] as any)
            [initType](...args)
            .then(resolve as any)
            .catch(reject);
          self._coreLogger.info(
            `SETUP: ${pluginName} INIT WITH ${initType} - COMPLETE`
          );
        });
      };
      self._coreLogger.info(`SETUP: ${plugin} - COMPLETE`);
    }

    self._coreLogger.info("SETUP: setupEventsAllPlugins - COMPLETE");
  }

  public async initCorePlugins(): Promise<void> {
    await this._coreLogger.info(`INIT: CORE: ${this._loggerName}`);
    if (!Tools.isNullOrUndefined(this._logger.init)) await this._logger.init!();
    await this._coreLogger.info(`INIT: CORE: ${this._eventsName}`);
    if (!Tools.isNullOrUndefined(this._events.init)) await this._events.init!();
  }
  public async initAllPlugins(): Promise<void> {
    await this._coreLogger.info("INIT: initAllPlugins");
    const pluginsToInit = Object.keys(this._loadedPlugins);
    for (let i = 0; i < pluginsToInit.length - 1; i++) {
      for (let j = i + 1; j < pluginsToInit.length; j++) {
        if (
          (this._loadedPlugins[pluginsToInit[i]].initIndex || -1) >
          (this._loadedPlugins[pluginsToInit[j]].initIndex || -1)
        ) {
          const temp = pluginsToInit[i];
          pluginsToInit[i] = pluginsToInit[j];
          pluginsToInit[j] = temp;
        }
      }
    }

    for (const pluginInOrder of pluginsToInit) {
      await this._coreLogger.info(
        `INIT: ${pluginInOrder}@${
          this._loadedPlugins[pluginInOrder].initIndex || -1
        }`
      );
      if (Tools.isNullOrUndefined(this._loadedPlugins[pluginInOrder].init)) {
        await this._coreLogger.info(
          `INIT: ${pluginInOrder}@${
            this._loadedPlugins[pluginInOrder].initIndex || -1
          } - IGNORE`
        );
        continue;
      }
      await this._loadedPlugins[pluginInOrder].init!();
      await this._coreLogger.info(
        `INIT: ${pluginInOrder}@${
          this._loadedPlugins[pluginInOrder].initIndex || -1
        } - COMPLETE`
      );
    }

    await this._coreLogger.info("INIT: initAllPlugins - COMPLETE");
  }

  public async loadAllPlugins(): Promise<void> {
    await this._coreLogger.info("LOAD: loadAllPlugins");
    const pluginsToInit = Object.keys(this._loadedPlugins);
    for (let i = 0; i < pluginsToInit.length - 1; i++) {
      for (let j = i + 1; j < pluginsToInit.length; j++) {
        if (
          (this._loadedPlugins[pluginsToInit[i]].loadedIndex || -1) >
          (this._loadedPlugins[pluginsToInit[j]].loadedIndex || -1)
        ) {
          const temp = pluginsToInit[i];
          pluginsToInit[i] = pluginsToInit[j];
          pluginsToInit[j] = temp;
        }
      }
    }

    for (const pluginInOrder of pluginsToInit) {
      await this._coreLogger.info(
        `LOAD: ${pluginInOrder}@${
          this._loadedPlugins[pluginInOrder].loadedIndex || -1
        }`
      );
      if (Tools.isNullOrUndefined(this._loadedPlugins[pluginInOrder].loaded)) {
        await this._coreLogger.info(
          `LOAD: ${pluginInOrder}@${
            this._loadedPlugins[pluginInOrder].loadedIndex || -1
          } - IGNORE`
        );
        continue;
      }
      await this._loadedPlugins[pluginInOrder].loaded!();
      await this._coreLogger.info(
        `LOAD: ${pluginInOrder}@${
          this._loadedPlugins[pluginInOrder].loadedIndex || -1
        } - COMPLETE`
      );
    }

    await this._coreLogger.info("LOAD: loadAllPlugins - COMPLETE");
  }
}