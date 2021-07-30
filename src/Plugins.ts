import * as FS from 'fs';
import * as PATH from 'path';
import { Tools } from '@bettercorp/tools/lib/Tools';
import { IDictionary } from '@bettercorp/tools/lib/Interfaces';
import { CEvents, CLogger, IEvents, ILogger, IPlugin, IPluginDefinition, IPluginLogger, IReadyPlugin } from "./ILib";
import { AppConfig } from './AppConfig';
import { Logger } from './DefaultLogger';
import { Events } from './DefaultEvents';

export class Plugins {
  private _cwd: string;
  private _coreLogger: IPluginLogger;
  private _defaultLogger: CLogger;
  private _appConfig: AppConfig;
  private _loadedPlugins: IDictionary<IPlugin> = {};
  private _plugins: Array<IReadyPlugin> = [];
  private _logger: CLogger;
  private _loggerName: string = "log";
  private _events: CEvents;
  private _eventsName: string = "events";

  constructor(log: IPluginLogger, logger: CLogger, appConfig: AppConfig, cwd: string) {
    this._cwd = cwd;
    this._defaultLogger = logger;
    this._coreLogger = log;
    this._appConfig = appConfig;
    this._logger = new Logger(this._loggerName, this._cwd, this._defaultLogger, this._appConfig);
    this._events = new Events(this._eventsName, this._cwd, this._defaultLogger, this._appConfig);
  }

  private getPluginType(name: string): IPluginDefinition {
    let pluginLow = name.toLowerCase();
    if (pluginLow.indexOf('events-') == 0) return IPluginDefinition.events;
    if (pluginLow.indexOf('log-') == 0 || pluginLow.indexOf('logs-') == 0) return IPluginDefinition.logging;
    return IPluginDefinition.normal;
  }

  private findPluginsFiles(path: string): Array<IReadyPlugin> {
    let arrOfPlugins: Array<IReadyPlugin> = [];

    this._coreLogger.info(`FIND: FIND plugins in [${ path }]`);
    for (let dirPluginFolderName of FS.readdirSync(path)) {
      let thisFullPath = PATH.join(path, dirPluginFolderName);
      if (!FS.statSync(thisFullPath).isDirectory()) {
        this._coreLogger.info(`FIND: IGNORE [${ thisFullPath }] Not a DIR`);
        continue;
      }
      if (dirPluginFolderName.indexOf('-') === 0) {
        this._coreLogger.info(`FIND: IGNORE [${ thisFullPath }] Defined for ignore`);
        continue;
      }
      let pluginFile = PATH.join(thisFullPath, 'plugin.ts');
      if (!FS.existsSync(pluginFile))
        pluginFile = PATH.join(thisFullPath, 'plugin.js');

      if (!FS.existsSync(pluginFile)) {
        this._coreLogger.info(`FIND: IGNORE [${ thisFullPath }] Not a valid plugin`);
        continue;
      }

      let pluginInstallerFile: string | null = PATH.join(thisFullPath, 'sec.config.ts');
      if (!FS.existsSync(pluginInstallerFile))
        pluginInstallerFile = PATH.join(thisFullPath, 'sec.config.js');

      if (!FS.existsSync(pluginInstallerFile))
        pluginInstallerFile = null;

      this._coreLogger.info(`FIND: READY [dirPluginFolderName] in: ${ thisFullPath }`);
      arrOfPlugins.push({
        name: dirPluginFolderName,
        pluginFile,
        installerFile: pluginInstallerFile
      });
    }

    return arrOfPlugins;
  }
  private findPluginsInBase(path: string): Array<IReadyPlugin> {
    let innerPluginLib = PATH.join(path, './src');
    if (!FS.existsSync(innerPluginLib) || !FS.statSync(innerPluginLib).isDirectory()) {
      innerPluginLib = PATH.join(path, './lib');
    }
    if (!FS.existsSync(innerPluginLib) || !FS.statSync(innerPluginLib).isDirectory()) {
      this._coreLogger.info(`FIND: IGNORE [${ innerPluginLib }] No src/lib dir in package`);
      return [];
    }
    const innerPluginLibPlugin = PATH.join(innerPluginLib, './plugins');
    if (!FS.existsSync(innerPluginLibPlugin) || !FS.statSync(innerPluginLibPlugin).isDirectory()) {
      this._coreLogger.info(`FIND: IGNORE [${ innerPluginLibPlugin }] No inner plugins dir`);
      return [];
    }

    return this.findPluginsFiles(innerPluginLibPlugin);
  }
  private findNPMPlugins(): Array<IReadyPlugin> {
    let arrOfPlugins: Array<IReadyPlugin> = [];

    const npmPluginsDir = PATH.join(this._cwd, './node_modules/@bettercorp');
    this._coreLogger.info(`FIND: NPM plugins in: ${ npmPluginsDir }`);
    for (let dirFileWhat of FS.readdirSync(npmPluginsDir)) {
      const pluginPath = PATH.join(npmPluginsDir, dirFileWhat);
      this._coreLogger.info(`FIND: CHECK [${ dirFileWhat }] ${ pluginPath }`);
      if (FS.statSync(pluginPath).isDirectory()) {
        if (dirFileWhat.indexOf('service-base') != 0) {
          this._coreLogger.info(`FIND: IGNORE [${ dirFileWhat }] Not a service base package`);
          continue;
        }

        arrOfPlugins = arrOfPlugins.concat(this.findPluginsInBase(pluginPath));
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


  private async getReadyToLoadPlugin(definition: IPluginDefinition, plugin: IReadyPlugin, mappedPluginName: string): Promise<IPlugin | ILogger | IEvents> {
    if (!Tools.isNullOrUndefined(this._loadedPlugins[plugin.name])) {
      this._coreLogger.fatal(`Cannot have 2 plugins with the same name!! [${ plugin.name }]`);
    }

    if (plugin.installerFile !== null) {
      this.loadPluginConfig(plugin.name, mappedPluginName, plugin.installerFile);
    } else {
      this._appConfig.updateAppConfig(plugin.name, mappedPluginName, {});
    }

    let importedPlugin = await import(plugin.pluginFile);
    this._coreLogger.info(`READY: ${ plugin.name } AS ${ mappedPluginName }[${ definition }]`);
    switch (definition) {
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
  private loadPluginConfig = (name: string, mappedPluginName: string, path: string): void => {
    let loadedFile = require(path);
    if (loadedFile.default !== undefined)
      loadedFile = loadedFile.default;
    let tPConfig = Tools.mergeObjects(loadedFile(mappedPluginName, this._appConfig.getPluginConfig(mappedPluginName)), this._appConfig.getPluginConfig(mappedPluginName));
    this._appConfig.updateAppConfig(name, mappedPluginName, tPConfig);
  };


  async constructAllPlugins(): Promise<void> {
    this._coreLogger.info(`CONSTRUCT: constructAllPlugins`);
    this._plugins = this.findAllPlugins();
    this._coreLogger.info(`CONSTRUCT: ${ this._plugins.length } plugins`);
    let logger: IReadyPlugin;
    let events: IReadyPlugin;
    for (let plugin of this._plugins) {
      this._coreLogger.info(`CONSTRUCT: LOGGER ${ plugin!.name } [CHECK]`);
      let pluginDefinition = this.getPluginType(plugin.name);
      if (pluginDefinition !== IPluginDefinition.logging) {
        this._coreLogger.info(`CONSTRUCT: LOGGER ${ plugin!.name } [NO]`);
        continue;
      }
      if (!this._appConfig.getPluginState(plugin.name)) {
        this._coreLogger.info(`CONSTRUCT: LOGGER ${ plugin!.name } [DISABLED]`);
        continue;
      }
      this._coreLogger.info(`CONSTRUCT: LOGGER ${ plugin!.name } [LOADED]`);
      logger = plugin;
      break;
    }
    for (let plugin of this._plugins) {
      this._coreLogger.info(`CONSTRUCT: EVENTS ${ plugin!.name } [CHECK]`);
      let pluginDefinition = this.getPluginType(plugin.name);
      if (pluginDefinition !== IPluginDefinition.events) {
        this._coreLogger.info(`CONSTRUCT: EVENTS ${ plugin!.name } [NO]`);
        continue;
      }
      if (!this._appConfig.getPluginState(plugin.name)) {
        this._coreLogger.info(`CONSTRUCT: EVENTS ${ plugin!.name } [DISABLED]`);
        continue;
      }
      this._coreLogger.info(`CONSTRUCT: EVENTS ${ plugin!.name } [LOADED]`);
      events = plugin;
      break;
    }

    // (pluginName: string, cwd: string, log: IPluginLogger, appConfig: AppConfig)
    if (!Tools.isNullOrUndefined(logger!)) {
      let mappedPlugin = this._appConfig.getMappedPluginName(logger!.name);
      this._coreLogger.info(`CONSTRUCT: ${ logger!.name } AS ${ mappedPlugin } [LOGGER]`);
      let readToLoadPlugin = (await this.getReadyToLoadPlugin(IPluginDefinition.logging, logger!, mappedPlugin));
      this._logger = new (readToLoadPlugin as any)(mappedPlugin, this._cwd, this._defaultLogger, this._appConfig);
    }
    const self = this;
    if (!Tools.isNullOrUndefined(events!)) {
      let mappedPlugin = this._appConfig.getMappedPluginName(events!.name);
      this._coreLogger.info(`CONSTRUCT: ${ events!.name } AS ${ mappedPlugin } [EVENTS]`);
      let readToLoadPlugin = (await this.getReadyToLoadPlugin(IPluginDefinition.events, events!, mappedPlugin));
      this._events = new (readToLoadPlugin as any)(mappedPlugin, this._cwd, {
        info: (...data: any[]): void => self._logger.error(mappedPlugin, ...data),
        warn: (...data: any[]): void => self._logger.error(mappedPlugin, ...data),
        error: (...data: any[]): void => self._logger.error(mappedPlugin, ...data),
        fatal: (...data: any[]): void => self._logger.error(mappedPlugin, ...data),
        debug: (...data: any[]): void => self._logger.error(mappedPlugin, ...data),
      }, this._appConfig);
    }
    for (let plugin of this._plugins) {
      let pluginDefinition = this.getPluginType(plugin.name);
      if (pluginDefinition !== IPluginDefinition.normal) continue;
      this._coreLogger.info(`CONSTRUCT: PLUGIN ${ plugin!.name } [CHECK]`);
      if (!this._appConfig.getPluginState(plugin.name)) {
        this._coreLogger.info(`CONSTRUCT: PLUGIN ${ plugin!.name } [DISABLED]`);
        continue;
      }
      let mappedPlugin = this._appConfig.getMappedPluginName(plugin.name);
      this._coreLogger.info(`CONSTRUCT: PLUGIN ${ plugin.name } AS ${ mappedPlugin }`);
      let readToLoadPlugin = (await this.getReadyToLoadPlugin(IPluginDefinition.events, plugin, mappedPlugin));
      this._loadedPlugins = new (readToLoadPlugin as any)(mappedPlugin, this._cwd, {
        info: (...data: any[]): void => self._logger.error(mappedPlugin, ...data),
        warn: (...data: any[]): void => self._logger.error(mappedPlugin, ...data),
        error: (...data: any[]): void => self._logger.error(mappedPlugin, ...data),
        fatal: (...data: any[]): void => self._logger.error(mappedPlugin, ...data),
        debug: (...data: any[]): void => self._logger.error(mappedPlugin, ...data),
      }, this._appConfig);
      this._coreLogger.info(`CONSTRUCT: PLUGIN ${ plugin!.name } [LOADED]`);
    }
  }

  async setupEventsAllPlugins(): Promise<void> {
    const self = this;
    self._coreLogger.info(`SETUP: setupEventsAllPlugins`);
    let pluginsToInit = Object.keys(self._loadedPlugins);

    for (let plugin of pluginsToInit) {
      self._coreLogger.info(`SETUP: ${ plugin }`);
      let mappedPlugin = this._appConfig.getMappedPluginName(plugin);
      self._loadedPlugins[plugin].onEvent = <T = any>(pluginName: string, event: string, listener: (data: T) => void): void => {
        let imappedPlugin = this._appConfig.getMappedPluginName(pluginName);
        return self._events.onEvent<T>(mappedPlugin, imappedPlugin, event, listener);
      };
      self._loadedPlugins[plugin].onReturnableEvent = <T = any>(pluginName: string, event: string, listener: (resolve: Function, reject: Function, data: T) => void): void => {
        let imappedPlugin = this._appConfig.getMappedPluginName(pluginName);
        return self._events.onReturnableEvent<T>(mappedPlugin, imappedPlugin, event, listener);
      };
      self._loadedPlugins[plugin].emitEvent = <T = any>(pluginName: string, event: string, data?: T): void => {
        let imappedPlugin = this._appConfig.getMappedPluginName(pluginName);
        return self._events.emitEvent<T>(mappedPlugin, imappedPlugin, event, data);
      };
      self._loadedPlugins[plugin].emitEventAndReturn = <T1 = any, T2 = any>(pluginName: string, event: string, data?: T1, timeoutSeconds?: number): Promise<T2> => {
        let imappedPlugin = this._appConfig.getMappedPluginName(pluginName);
        return self._events.emitEventAndReturn<T1, T2>(mappedPlugin, imappedPlugin, event, data, timeoutSeconds);
      };
      self._loadedPlugins[plugin].initForPlugins = <ArgsDataType = any, ReturnDataType = void>(pluginName: string, initType: string, ...args: Array<ArgsDataType>): Promise<ReturnDataType> => {
        return new Promise((resolve, reject) => {
          if (pluginsToInit.indexOf(pluginName) < 0) {
            return self._logger.fatal(`Please install and enable the plugin ${ pluginName } to be able to init for it.`);
          }

          if (Tools.isNullOrUndefined((self._loadedPlugins[plugin] as any)[initType]))
            return self._logger.fatal(`The plugin ${ pluginName } does not have a method ${ initType }... Please check the plugin docs`);

          self._coreLogger.info(`SETUP: ${ plugin } INIT WITH ${ initType }`);
          (self._loadedPlugins[plugin] as any)[initType](...args).then(resolve as any).catch(reject);
          self._coreLogger.info(`SETUP: ${ plugin } INIT WITH ${ initType } - COMPLETE`);
        });
      };
      self._coreLogger.info(`SETUP: ${ plugin } - COMPLETE`);
    }

    self._coreLogger.info(`SETUP: setupEventsAllPlugins - COMPLETE`);
  }

  async initAllPlugins(): Promise<void> {
    this._coreLogger.info(`INIT: initAllPlugins`);
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

    this._coreLogger.info(`INIT: initAllPlugins - COMPLETE`);
  }

  async loadAllPlugins(): Promise<void> {
    this._coreLogger.info(`LOAD: loadAllPlugins`);
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

    this._coreLogger.info(`LOAD: loadAllPlugins - COMPLETE`);
  }
}