import { IPluginLogger } from "../interfaces/logger";
import { IPluginDefinition, IReadyPlugin } from "../interfaces/service";
import { IServiceEvents } from "../interfaces/events";
import { SBBase } from "./base";
import { ServicesBase } from "../service/service";
import { ConfigBase } from '../config/config';

export class SBServices {
  private _activeServices: Array<ServicesBase> = [];
  private log: IPluginLogger;
  constructor(log: IPluginLogger) {
    this.log = log;
  }
  public dispose() {
    for (let service of this._activeServices) {
      this.log.warn("disposing {service}", { service: service.pluginName });
      if (service !== undefined) service.dispose();
    }
  }

  async setupServicePlugins(
    cwd: string,
    plugins: Array<IReadyPlugin>,
    appConfig: ConfigBase,
    ImportAndMigratePluginConfig: { (plugin: IReadyPlugin): Promise<any> },
    generateEventsForService: {
      (pluginName: string, mappedPluginName: string): IServiceEvents<any, any>;
    },
    generateLoggerForPlugin: { (pluginName: string): IPluginLogger }
  ) {
    for (let plugin of plugins) {
      if (plugin.pluginDefinition !== IPluginDefinition.service) continue;

      await this.log.debug(`Import service plugin: {name} from {file}`, {
        name: plugin.name,
        file: plugin.pluginFile,
      });
      const importedPlugin = await import(plugin.pluginFile);

      await this.log.debug(`Construct service plugin: {name}`, {
        name: plugin.name,
      });

      let servicePlugin =
        new (importedPlugin.Service as unknown as typeof ServicesBase)(
          plugin.name,
          cwd,
          generateLoggerForPlugin(plugin.mappedName)
        );
      await this.log.debug(`Create service plugin: {name}`, {
        name: plugin.name,
      });
      //const importedPlugin = await import(plugin.pluginFile);
      await this.log.info(
        "Setting up {pluginName} ({mappedName}) as new base service platform",
        {
          pluginName: plugin.name,
          mappedName: plugin.mappedName,
        }
      );
      await this.log.info("Builing {pluginName} as new base service platform", {
        pluginName: plugin.name,
      });
      await SBBase.setupServicePlugin(
        servicePlugin,
        await generateEventsForService(plugin.name, plugin.mappedName),
        appConfig,
        cwd,
        generateEventsForService,
        generateLoggerForPlugin
      );

      await this.log.info(
        "Ready {pluginName} ({mappedName}) as new base service platform",
        {
          pluginName: plugin.name,
          mappedName: plugin.mappedName,
        }
      );

      await ImportAndMigratePluginConfig(plugin);

      this._activeServices.push(servicePlugin);
    }
  }

  public async servicesInit() {
    let orderOfPlugins = this._activeServices.map((x) => {
      return {
        name: x.pluginName,
        requires: x.initRequiredPlugins || [],
        ref: x,
      };
    });
    for (let i = 0; i < orderOfPlugins.length - 1; i++) {
      for (let j = i + 1; j < orderOfPlugins.length; j++) {
        if (orderOfPlugins[i].requires.indexOf(orderOfPlugins[j].name) >= 0) {
          this.log.debug(`{plugin} init requires {reqName}`, {
            plugin: orderOfPlugins[i].name,
            reqName: orderOfPlugins[j].name,
          });
          const temp = orderOfPlugins[i];
          orderOfPlugins[i] = orderOfPlugins[j];
          orderOfPlugins[j] = temp;
        }
      }
    }
    for (let service of orderOfPlugins) {
      this.log.debug(`{plugin} init`, {
        plugin: service.name,
      });
      await service.ref.init();
    }
  }

  public async servicesRun() {
    let orderOfPlugins = this._activeServices.map((x) => {
      return {
        name: x.pluginName,
        requires: x.runRequiredPlugins || [],
        ref: x,
      };
    });
    for (let i = 0; i < orderOfPlugins.length - 1; i++) {
      for (let j = i + 1; j < orderOfPlugins.length; j++) {
        if (orderOfPlugins[i].requires.indexOf(orderOfPlugins[j].name) >= 0) {
          this.log.debug(`{plugin} run requires {reqName}`, {
            plugin: orderOfPlugins[i].name,
            reqName: orderOfPlugins[j].name,
          });
          const temp = orderOfPlugins[i];
          orderOfPlugins[i] = orderOfPlugins[j];
          orderOfPlugins[j] = temp;
        }
      }
    }
    for (let service of orderOfPlugins) {
      this.log.debug(`{plugin} run`, {
        plugin: service.name,
      });
      await service.ref.run();
    }
  }

  /*  public async initCorePlugins(): Promise<void> {
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
  }*/
}
