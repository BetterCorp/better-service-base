import { readdirSync, statSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { Tools } from "@bettercorp/tools/lib/Tools";
import { IDictionary } from "@bettercorp/tools/lib/Interfaces";
import { CLogger, IConfig, IEvents, ILogger, IPlugin, IPluginDefinition, IPluginLogger, IReadyPlugin } from "./ILib";
import { DefaultConfig } from "./DefaultConfig";
import { Logger } from "./DefaultLogger";
import { Events } from "./DefaultEvents";

export class Plugins {
  private _cwd: string;
  private _coreLogger: IPluginLogger;
  private _defaultLogger: CLogger;
  private _appConfig!: IConfig;
  private _loadedPlugins: IDictionary<IPlugin> = {};
  private _plugins: Array<IReadyPlugin> = [];
  private _logger: ILogger;
  private _loggerName: string = "log";
  private _events: IEvents;
  private _eventsName: string = "events";

  constructor(log: IPluginLogger, logger: CLogger, cwd: string) {
    this._cwd = cwd;
    this._defaultLogger = logger;
    this._coreLogger = log;
    this._logger = new Logger(this._loggerName, this._cwd, this._defaultLogger, undefined as any);
    this._events = new Events(this._eventsName, this._cwd, this._defaultLogger, undefined as any);

    this._coreLogger.info("FIND: findAllPlugins");
    this._plugins = this.findAllPlugins();
    this._coreLogger.info(`FIND: ${ this._plugins.length } plugins`);
  }

  private getPluginType(name: string): IPluginDefinition {
    let pluginLow = name.toLowerCase();
    if (pluginLow.indexOf("config-") === 0) return IPluginDefinition.config;
    if (pluginLow.indexOf("events-") === 0) return IPluginDefinition.events;
    if (pluginLow.indexOf("log-") === 0 || pluginLow.indexOf("logs-") === 0) return IPluginDefinition.logging;
    return IPluginDefinition.normal;
  }

  private findPluginsFiles(path: string, version: string): Array<IReadyPlugin> {
    let arrOfPlugins: Array<IReadyPlugin> = [];

    this._coreLogger.debug(`FIND: FIND plugins in [${ path }]`);
    for (let dirPluginFolderName of readdirSync(path)) {
      let thisFullPath = join(path, dirPluginFolderName);
      if (!statSync(thisFullPath).isDirectory()) {
        this._coreLogger.debug(`FIND: IGNORE [${ thisFullPath }] Not a DIR`);
        continue;
      }
      if (dirPluginFolderName.indexOf("-") === 0) {
        this._coreLogger.debug(`FIND: IGNORE [${ thisFullPath }] Defined for ignore`);
        continue;
      }
      let pluginFile = join(thisFullPath, "plugin.ts");
      if (!existsSync(pluginFile))
        pluginFile = join(thisFullPath, "plugin.js");

      if (!existsSync(pluginFile)) {
        this._coreLogger.debug(`FIND: IGNORE [${ thisFullPath }] Not a valid plugin`);
        continue;
      }

      let pluginInstallerFile: string | null = join(thisFullPath, "sec.config.ts");
      if (!existsSync(pluginInstallerFile))
        pluginInstallerFile = join(thisFullPath, "sec.config.js");

      if (!existsSync(pluginInstallerFile))
        pluginInstallerFile = null;

      this._coreLogger.debug(`FIND: READY [${ dirPluginFolderName }] in: ${ thisFullPath }`);
      arrOfPlugins.push({
        pluginDefinition: this.getPluginType(dirPluginFolderName),
        name: dirPluginFolderName,
        version,
        pluginFile,
        installerFile: pluginInstallerFile
      });
    }

    return arrOfPlugins;
  }
  private findPluginsInBase(path: string, libOnly: boolean = false): Array<IReadyPlugin> {
    const pluginJson = JSON.parse(readFileSync(join(path, "./package.json"), "utf-8").toString());
    if (pluginJson.bsb_project !== true) {
      this._coreLogger.debug("FIND: IGNORE AS NOT BSB PROJECT");
      return [];
    }

    let innerPluginLib = join(path, "./src");
    if (libOnly || !existsSync(innerPluginLib) || !statSync(innerPluginLib).isDirectory()) {
      innerPluginLib = join(path, "./lib");
    }
    if (!existsSync(innerPluginLib) || !statSync(innerPluginLib).isDirectory()) {
      this._coreLogger.debug(`FIND: IGNORE [${ innerPluginLib }] No src/lib dir in package`);
      return [];
    }
    const innerPluginLibPlugin = join(innerPluginLib, "./plugins");
    if (!existsSync(innerPluginLibPlugin) || !statSync(innerPluginLibPlugin).isDirectory()) {
      this._coreLogger.debug(`FIND: IGNORE [${ innerPluginLibPlugin }] No inner plugins dir`);
      return [];
    }

    let packageVersion = pluginJson.version;
    return this.findPluginsFiles(innerPluginLibPlugin, packageVersion);
  }
  private findNPMPlugins(): Array<IReadyPlugin> {
    let arrOfPlugins: Array<IReadyPlugin> = [];

    const npmPluginsDir = join(this._cwd, "./node_modules");
    this._coreLogger.debug(`FIND: NPM plugins in: ${ npmPluginsDir }`);
    for (let dirFileWhat of readdirSync(npmPluginsDir)) {
      const pluginPath = join(npmPluginsDir, dirFileWhat);
      if (dirFileWhat.indexOf(".") === 0) {
        continue;
      }
      if (dirFileWhat.indexOf("@") === 0) {
        this._coreLogger.debug(`FIND: GROUP [${ dirFileWhat }] ${ pluginPath }`);
        for (let groupPluginName of readdirSync(pluginPath)) {
          if (groupPluginName.indexOf(".") === 0) {
            continue;
          }
          const groupPluginPath = join(pluginPath, groupPluginName);
          this._coreLogger.debug(`FIND: CHECK [${ dirFileWhat }/${ groupPluginName }] ${ groupPluginPath }`);
          if (statSync(groupPluginPath).isDirectory()) {
            arrOfPlugins = arrOfPlugins.concat(this.findPluginsInBase(groupPluginPath, true));
          }
        }
      }
      else {
        this._coreLogger.debug(`FIND: CHECK [${ dirFileWhat }] ${ pluginPath }`);
        if (statSync(pluginPath).isDirectory()) {
          arrOfPlugins = arrOfPlugins.concat(this.findPluginsInBase(pluginPath, true));
        }
      }
    }

    return arrOfPlugins;
  }
  private findLocalPlugins(): Array<IReadyPlugin> {
    return this.findPluginsInBase(this._cwd);
  }
  private findAllPlugins(): Array<IReadyPlugin> {
    return this.findNPMPlugins().concat(this.findLocalPlugins());
  }

  private async loadPluginConfig(name: string, mappedPluginName: string, path: string): Promise<void> {
    this._coreLogger.debug(`LOAD P CONFIG: ${ name }`);
    let loadedFile = require(path);
    if (loadedFile.default !== undefined)
      loadedFile = loadedFile.default;
    this._coreLogger.debug(`LOAD P CONFIG: ${ name } Ready`);
    let tPConfig = Tools.mergeObjects(loadedFile(mappedPluginName, this._appConfig.getPluginConfig(mappedPluginName)), this._appConfig.getPluginConfig(mappedPluginName));
    this._coreLogger.debug(`LOAD P CONFIG: ${ name } Update app config`);
    await this._appConfig.updateAppConfig(name, mappedPluginName, tPConfig);
    this._coreLogger.debug(`LOAD P CONFIG: ${ name } Complete`);
  }

  private async getReadyPluginConfig(definition: IPluginDefinition, plugin: IReadyPlugin, mappedPluginName: string): Promise<void> {
    this._coreLogger.debug(`READY: ${ plugin.name } AS ${ mappedPluginName } [${ definition }]`);
    if (!Tools.isNullOrUndefined(this._loadedPlugins[plugin.name])) {
      this._coreLogger.fatal(`Cannot have 2 plugins with the same name!! [${ plugin.name }]`);
    }

    this._coreLogger.debug(`READY: ${ plugin.name } Installer`);
    if (plugin.installerFile !== null) {
      this._coreLogger.debug(`READY: ${ plugin.name } Installer from ${ plugin.installerFile }`);
      this.loadPluginConfig(plugin.name, mappedPluginName, plugin.installerFile);
    } else {
      this._coreLogger.debug(`READY: ${ plugin.name } Installer as {}`);
      await this._appConfig.updateAppConfig(plugin.name, mappedPluginName);
    }
    this._coreLogger.debug(`READY: ${ plugin.name } Installer Complete`);
  }

  private async getReadyToLoadPlugin(plugin: IReadyPlugin, mappedPluginName: string): Promise<IConfig | IPlugin | ILogger | IEvents> {
    this.getReadyPluginConfig(plugin.pluginDefinition, plugin, mappedPluginName);

    this._coreLogger.debug(`READY: ${ plugin.name }v${ plugin.version } Import`);
    let importedPlugin = await import(plugin.pluginFile);
    this._coreLogger.debug(`READY: ${ plugin.name }v${ plugin.version } Create instance`);
    switch (plugin.pluginDefinition) {
      case IPluginDefinition.config:
        if (Tools.isNullOrUndefined(importedPlugin.Config))
          this._defaultLogger.fatal(`Cannot find Config in ${ plugin.name }`);
        return importedPlugin.Config;
      case IPluginDefinition.events:
        if (Tools.isNullOrUndefined(importedPlugin.Events))
          this._defaultLogger.fatal(`Cannot find Events in ${ plugin.name }`);
        return importedPlugin.Events;
      case IPluginDefinition.logging:
        if (Tools.isNullOrUndefined(importedPlugin.Logger))
          this._defaultLogger.fatal(`Cannot find Logger in ${ plugin.name }`);
        return importedPlugin.Logger;
      default:
        if (Tools.isNullOrUndefined(importedPlugin.Plugin))
          this._defaultLogger.fatal(`Cannot find Plugin in ${ plugin.name }`);
        return importedPlugin.Plugin;
    }
  }

  public async setupConfigAllPlugins(): Promise<void> {
    let deploymentProfile = "default";
    if (!Tools.isNullOrUndefined(process.env.BSB_PROFILE)) {
      deploymentProfile = process.env.BSB_PROFILE!;
    }
    if ((!Tools.isNullOrUndefined(process.env.BSB_CONFIG_PLUGIN) && process.env.BSB_CONFIG_PLUGIN !== '') || existsSync(join(this._cwd, './BSB_CONFIG_PLUGIN'))) {
      let pluginName = process.env.BSB_CONFIG_PLUGIN || readFileSync(join(this._cwd, './BSB_CONFIG_PLUGIN')).toString();
      this._coreLogger.info(`APP_CONFIG: PLUGIN ${ pluginName } check`);
      for (const plugin of this._plugins) {
        if (plugin.pluginDefinition === IPluginDefinition.config) {
          if (pluginName !== plugin.name) continue;
          this._coreLogger.info(`APP_CONFIG: PLUGIN ${ plugin.name }v${ plugin.version }`);
          let configPlugin = ((await this.getReadyToLoadPlugin(plugin, plugin.name)) as any);
          this._appConfig = new configPlugin(this._defaultLogger, this._cwd, deploymentProfile);
          this._coreLogger.info(`APP_CONFIG: PLUGIN ${ plugin!.name }v${ plugin.version } [CONFIGURED]`);
        }
      }
    }
    if (Tools.isNullOrUndefined(this._appConfig)) {
      this._coreLogger.info(`APP_CONFIG: PLUGIN default`);
      this._appConfig = new DefaultConfig(this._defaultLogger, this._cwd, deploymentProfile);
      this._coreLogger.info(`APP_CONFIG: PLUGIN default [CONFIGURED]`);
    }
    await this._appConfig.refreshAppConfig();
  }
  public async configAllPlugins(): Promise<void> {
    this._coreLogger.info(`CONFIG: ${ this._plugins.length } plugins`);
    for (const plugin of this._plugins) {
      if (plugin.pluginDefinition === IPluginDefinition.config) continue;
      let mappedPlugin = this._appConfig.getMappedPluginName(plugin.name);
      this._coreLogger.info(`CONFIG: PLUGIN ${ plugin.name }v${ plugin.version } AS ${ mappedPlugin }`);
      this.getReadyPluginConfig(plugin.pluginDefinition, plugin, mappedPlugin);
      this._coreLogger.info(`CONFIG: PLUGIN ${ plugin!.name }v${ plugin.version } [CONFIGURED]`);
    }
  }

  public async constructAllPlugins(): Promise<void> {
    this._coreLogger.info("CONSTRUCT: constructAllPlugins");
    for (let plugin of this._plugins) {
      if (plugin.pluginDefinition === IPluginDefinition.config) continue;
      let mappedPluginName = this._appConfig.getMappedPluginName(plugin.name);
      await this._appConfig.updateAppConfig(plugin.name, mappedPluginName);
    }
    this._coreLogger.info(`CONSTRUCT: ${ this._plugins.length } plugins`);
    let logger: IReadyPlugin;
    let events: IReadyPlugin;
    for (let plugin of this._plugins) {
      if (plugin.pluginDefinition !== IPluginDefinition.logging) {
        continue;
      }
      if (!this._appConfig.getPluginState(plugin.name)) {
        continue;
      }
      this._coreLogger.info(`CONSTRUCT: LOGGER ${ plugin.name }v${ plugin.version } [LOADED]`);
      logger = plugin;
      break;
    }
    for (let plugin of this._plugins) {
      if (plugin.pluginDefinition !== IPluginDefinition.events) {
        continue;
      }
      if (!this._appConfig.getPluginState(plugin.name)) {
        continue;
      }
      this._coreLogger.info(`CONSTRUCT: EVENTS ${ plugin.name }v${ plugin.version } [LOADED]`);
      events = plugin;
      break;
    }

    // (pluginName: string, cwd: string, log: IPluginLogger, appConfig: AppConfig)
    if (!Tools.isNullOrUndefined(logger!)) {
      let mappedPlugin = this._appConfig.getMappedPluginName(logger!.name);
      this._coreLogger.info(`CONSTRUCT: ${ logger!.name } AS ${ mappedPlugin } [LOGGER]`);
      let readToLoadPlugin = (await this.getReadyToLoadPlugin(logger!, mappedPlugin));
      this._logger = new (readToLoadPlugin as any)(mappedPlugin, this._cwd, this._defaultLogger, this._appConfig);
    }
    const self = this;
    if (!Tools.isNullOrUndefined(events!)) {
      let mappedPlugin = this._appConfig.getMappedPluginName(events!.name);
      this._coreLogger.info(`CONSTRUCT: ${ events!.name } AS ${ mappedPlugin } [EVENTS]`);
      let readToLoadPlugin = (await this.getReadyToLoadPlugin(events!, mappedPlugin));
      this._events = new (readToLoadPlugin as any)(mappedPlugin, this._cwd, {
        info: (...data: any[]): void => self._logger.error(mappedPlugin, ...data),
        warn: (...data: any[]): void => self._logger.error(mappedPlugin, ...data),
        error: (...data: any[]): void => self._logger.error(mappedPlugin, ...data),
        fatal: (...data: any[]): void => self._logger.error(mappedPlugin, ...data),
        debug: (...data: any[]): void => self._logger.error(mappedPlugin, ...data),
      }, this._appConfig);
    }
    for (let plugin of this._plugins) {
      if (plugin.pluginDefinition !== IPluginDefinition.normal) continue;
      this._coreLogger.info(`CONSTRUCT: PLUGIN ${ plugin!.name } [CHECK]`);
      if (!this._appConfig.getPluginState(plugin.name)) {
        this._coreLogger.info(`CONSTRUCT: PLUGIN ${ plugin!.name } [DISABLED]`);
        continue;
      }
      let mappedPlugin = this._appConfig.getMappedPluginName(plugin.name);
      this._coreLogger.info(`CONSTRUCT: PLUGIN ${ plugin.name }v${ plugin.version } AS ${ mappedPlugin }`);
      let readToLoadPlugin = (await this.getReadyToLoadPlugin(plugin, mappedPlugin));
      this._coreLogger.info(`CONSTRUCT: PLUGIN ${ plugin.name }v${ plugin.version } Render`);
      this._loadedPlugins[plugin.name] = new (readToLoadPlugin as any)(mappedPlugin, this._cwd, {
        info: (...data: any[]): void => self._logger.error(mappedPlugin, ...data),
        warn: (...data: any[]): void => self._logger.error(mappedPlugin, ...data),
        error: (...data: any[]): void => self._logger.error(mappedPlugin, ...data),
        fatal: (...data: any[]): void => self._logger.error(mappedPlugin, ...data),
        debug: (...data: any[]): void => self._logger.error(mappedPlugin, ...data),
      }, this._appConfig);
      this._coreLogger.info(`CONSTRUCT: PLUGIN ${ plugin!.name } [LOADED]`);
    }
    this._coreLogger.info(`CONSTRUCTED: [${ Object.keys(this._loadedPlugins).join(",") }]`);
  }

  public async setupEventsAllPlugins(): Promise<void> {
    const self = this;
    self._coreLogger.info("SETUP: setupEventsAllPlugins");
    let pluginsToInit = Object.keys(self._loadedPlugins);

    for (let plugin of pluginsToInit) {
      self._coreLogger.info(`SETUP: ${ plugin }`);
      let mappedPlugin = this._appConfig.getMappedPluginName(plugin);
      self._loadedPlugins[plugin].onEvent = <T = any>(pluginName: string, event: string, listener: (data: T) => void): void => {
        let imappedPlugin = this._appConfig.getMappedPluginName(pluginName || plugin);
        return self._events.onEvent<T>(mappedPlugin, imappedPlugin, event, listener);
      };
      self._loadedPlugins[plugin].onReturnableEvent = <T = any>(pluginName: string, event: string, listener: (resolve: Function, reject: Function, data: T) => void): void => {
        let imappedPlugin = this._appConfig.getMappedPluginName(pluginName || plugin);
        return self._events.onReturnableEvent<T>(mappedPlugin, imappedPlugin, event, listener);
      };
      self._loadedPlugins[plugin].emitEvent = <T = any>(pluginName: string, event: string, data?: T): void => {
        let imappedPlugin = this._appConfig.getMappedPluginName(pluginName || plugin);
        return self._events.emitEvent<T>(mappedPlugin, imappedPlugin, event, data);
      };
      self._loadedPlugins[plugin].emitEventAndReturn = <T1 = any, T2 = any>(pluginName: string, event: string, data?: T1, timeoutSeconds?: number): Promise<T2> => {
        let imappedPlugin = this._appConfig.getMappedPluginName(pluginName || plugin);
        return self._events.emitEventAndReturn<T1, T2>(mappedPlugin, imappedPlugin, event, data, timeoutSeconds);
      };
      self._loadedPlugins[plugin].initForPlugins = <ArgsDataType = any, ReturnDataType = void>(pluginName: string, initType: string, ...args: Array<ArgsDataType>): Promise<ReturnDataType> => {
        return new Promise((resolve, reject) => {
          if (pluginsToInit.indexOf(pluginName) < 0) {
            return self._logger.fatal(`Please install and enable the plugin ${ pluginName } to be able to init for it.`);
          }
          if (Tools.isNullOrUndefined(self._loadedPlugins[pluginName])) {
            return self._logger.fatal(`Plugin reference error: ${ pluginName }`);
          }

          if (typeof (self._loadedPlugins[pluginName] as any)[initType] !== "function")
            return self._logger.fatal(`The plugin ${ pluginName } does not have a method ${ initType }... [${ Object.keys((self._loadedPlugins[pluginName] as any)).join(",") }]`);

          self._coreLogger.info(`SETUP: ${ pluginName } INIT WITH ${ initType }`);
          (self._loadedPlugins[pluginName] as any)[initType](...args).then(resolve as any).catch(reject);
          self._coreLogger.info(`SETUP: ${ pluginName } INIT WITH ${ initType } - COMPLETE`);
        });
      };
      self._coreLogger.info(`SETUP: ${ plugin } - COMPLETE`);
    }

    self._coreLogger.info("SETUP: setupEventsAllPlugins - COMPLETE");
  }

  public async initCorePlugins(): Promise<void> {
    this._coreLogger.info(`INIT: CORE: ${ this._loggerName }`);
    if (!Tools.isNullOrUndefined(this._logger.init))
      await this._logger.init!();
    this._coreLogger.info(`INIT: CORE: ${ this._eventsName }`);
    if (!Tools.isNullOrUndefined(this._events.init))
      await this._events.init!();
  }
  public async initAllPlugins(): Promise<void> {
    this._coreLogger.info("INIT: initAllPlugins");
    let pluginsToInit = Object.keys(this._loadedPlugins);
    for (let i = 0; i < pluginsToInit.length - 1; i++) {
      for (let j = i + 1; j < pluginsToInit.length; j++) {
        if ((this._loadedPlugins[pluginsToInit[i]].initIndex || -1) > (this._loadedPlugins[pluginsToInit[j]].initIndex || -1)) {
          let temp = pluginsToInit[i];
          pluginsToInit[i] = pluginsToInit[j];
          pluginsToInit[j] = temp;
        }
      }
    }

    for (let pluginInOrder of pluginsToInit) {
      this._coreLogger.info(`INIT: ${ pluginInOrder }@${ this._loadedPlugins[pluginInOrder].initIndex || -1 }`);
      if (Tools.isNullOrUndefined(this._loadedPlugins[pluginInOrder].init)) {
        this._coreLogger.info(`INIT: ${ pluginInOrder }@${ this._loadedPlugins[pluginInOrder].initIndex || -1 } - IGNORE`);
        continue;
      }
      await this._loadedPlugins[pluginInOrder].init!();
      this._coreLogger.info(`INIT: ${ pluginInOrder }@${ this._loadedPlugins[pluginInOrder].initIndex || -1 } - COMPLETE`);
    }

    this._coreLogger.info("INIT: initAllPlugins - COMPLETE");
  }

  public async loadAllPlugins(): Promise<void> {
    this._coreLogger.info("LOAD: loadAllPlugins");
    let pluginsToInit = Object.keys(this._loadedPlugins);
    for (let i = 0; i < pluginsToInit.length - 1; i++) {
      for (let j = i + 1; j < pluginsToInit.length; j++) {
        if ((this._loadedPlugins[pluginsToInit[i]].loadedIndex || -1) > (this._loadedPlugins[pluginsToInit[j]].loadedIndex || -1)) {
          let temp = pluginsToInit[i];
          pluginsToInit[i] = pluginsToInit[j];
          pluginsToInit[j] = temp;
        }
      }
    }

    for (let pluginInOrder of pluginsToInit) {
      this._coreLogger.info(`LOAD: ${ pluginInOrder }@${ this._loadedPlugins[pluginInOrder].loadedIndex || -1 }`);
      if (Tools.isNullOrUndefined(this._loadedPlugins[pluginInOrder].loaded)) {
        this._coreLogger.info(`LOAD: ${ pluginInOrder }@${ this._loadedPlugins[pluginInOrder].loadedIndex || -1 } - IGNORE`);
        continue;
      }
      await this._loadedPlugins[pluginInOrder].loaded!();
      this._coreLogger.info(`LOAD: ${ pluginInOrder }@${ this._loadedPlugins[pluginInOrder].loadedIndex || -1 } - COMPLETE`);
    }

    this._coreLogger.info("LOAD: loadAllPlugins - COMPLETE");
  }
}