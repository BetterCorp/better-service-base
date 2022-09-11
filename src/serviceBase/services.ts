import { IPluginLogger } from "../interfaces/logger";
import { IPluginDefinition, IReadyPlugin } from "../interfaces/service";
import { IServiceEvents } from "../interfaces/events";
import { SBBase } from "./base";
import { ServicesBase } from "../service/service";
import { ConfigBase } from "../config/config";
import { ErrorMessages } from "../interfaces/static";

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
      (pluginName: string, mappedPluginName: string): IServiceEvents<
        any,
        any,
        any,
        any
      >;
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
      const self = this;
      await SBBase.setupServicePlugin(
        servicePlugin,
        await generateEventsForService(plugin.name, plugin.mappedName),
        appConfig,
        cwd,
        generateEventsForService,
        generateLoggerForPlugin,
        this.log,
        async (pluginName: string, method: string, args: Array<any>) => {
          for (let plugin of self._activeServices) {
            if (plugin.pluginName === pluginName) {
              return await (plugin as any)[method](...args);
            }
          }
          self.log.error(
            "Enable {pluginName} in order to call ({method}) from it",
            { pluginName, method }
          );
          throw ErrorMessages.ServicePluginNotCallableMethod;
        }
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
}