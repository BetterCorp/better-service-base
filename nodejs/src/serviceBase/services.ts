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
    appId: string,
    runningDebug: boolean,
    runningLive: boolean,
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
          plugin.mappedName,
          cwd,
          plugin.pluginDir,
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
      SBBase.setupPlugin(
        appId,
        runningDebug,
        runningLive,
        servicePlugin,
        appConfig
      );
      await SBBase.setupServicePlugin(
        servicePlugin,
        await generateEventsForService(plugin.name, plugin.mappedName),
        appConfig,
        cwd,
        plugin.pluginDir,
        generateEventsForService,
        generateLoggerForPlugin,
        this.log,
        async (pluginName: string, method: string, args: Array<any>) => {
          for (let plugin of self._activeServices) {
            if (plugin.pluginName === pluginName) {
              return await (plugin as any)[method](...args);
            }
          }
          await self.log.error(
            "Enable {pluginName} in order to call ({method}) from it",
            { pluginName, method }
          );
          throw ErrorMessages.ServicePluginNotCallableMethod;
        }
      );

      await this.log.info(
        "Setup {pluginName} ({mappedName}) referenced clients",
        {
          pluginName: plugin.name,
          mappedName: plugin.mappedName,
        }
      );

      for (let client of (servicePlugin as any)._clients) {
        await this.log.info(
          "Setup {pluginName} ({mappedName}) references {clientPlugin}",
          {
            pluginName: plugin.name,
            mappedName: plugin.mappedName,
            clientPlugin: client._pluginName,
          }
        );
        await client._register();
      }

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

  public async servicesInit(config: ConfigBase) {
    await this.log.info("Init all services");
    let orderOfPlugins = await this.makeAfterRequired(
      config,
      await this.makeBeforeRequired(
        config,
        this._activeServices.map((x) => {
          return {
            name: x.pluginName,
            after: x.initAfterPlugins || [],
            before: x.initBeforePlugins || [],
            ref: x,
          };
        })
      )
    );
    await this.log.debug("Services init default order: {initOrder}", {
      initOrder: this._activeServices
        .map(
          (x) =>
            `[(${(x.initAfterPlugins || []).join(",")})${x.pluginName}(${(
              x.initBeforePlugins || []
            ).join(",")})]`
        )
        .join(","),
    });
    await this.log.debug("Services init order: {initOrder}", {
      initOrder: orderOfPlugins
        .map((x) => `[(${x.after.join(",")})${x.name}(${x.before.join(",")})]`)
        .join(","),
    });
    for (let service of orderOfPlugins) {
      await this.log.debug(`{plugin} init`, {
        plugin: service.name,
      });
      await service.ref.init();
    }
  }

  public async makeBeforeRequired(
    config: ConfigBase,
    orderOfPlugins: {
      name: string;
      after: string[];
      before: string[];
      ref: ServicesBase;
    }[]
  ) {
    for (let i = 0; i < orderOfPlugins.length; i++) {
      if (orderOfPlugins[i].before.length === 0) continue;
      for (let bPlugin of await this.parsePluginNamesToMappedNames(
        config,
        orderOfPlugins[i].before
      ))
        for (let j = 0; j < orderOfPlugins.length; j++) {
          if (orderOfPlugins[j].name == bPlugin) {
            orderOfPlugins[j].after.push(orderOfPlugins[i].name);
          }
        }
    }
    return orderOfPlugins;
  }
  private async parsePluginNamesToMappedNames(
    config: ConfigBase,
    plugins: Array<string>
  ): Promise<Array<string>> {
    for (let pIndex = 0; pIndex < plugins.length; pIndex++) {
      plugins[pIndex] = await config.getAppPluginMappedName(plugins[pIndex]);
    }
    return plugins;
  }
  public async makeAfterRequired(
    config: ConfigBase,
    orderOfPlugins: {
      name: string;
      after: string[];
      before: string[];
      ref: ServicesBase;
    }[]
  ) {
    for (let i = 0; i < orderOfPlugins.length - 1; i++) {
      for (let j = i + 1; j < orderOfPlugins.length; j++) {
        if (
          (
            await this.parsePluginNamesToMappedNames(
              config,
              orderOfPlugins[i].after
            )
          ).indexOf(orderOfPlugins[j].name) >= 0
        ) {
          await this.log.debug(`{plugin} run after {reqName}`, {
            plugin: orderOfPlugins[i].name,
            reqName: orderOfPlugins[j].name,
          });
          const temp = orderOfPlugins[i];
          orderOfPlugins[i] = orderOfPlugins[j];
          orderOfPlugins[j] = temp;
        }
      }
    }
    return orderOfPlugins;
  }

  public async servicesRun(config: ConfigBase) {
    await this.log.info("Run all services");
    let orderOfPlugins = await this.makeAfterRequired(
      config,
      await this.makeBeforeRequired(
        config,
        this._activeServices.map((x) => {
          return {
            name: x.pluginName,
            after: x.runAfterPlugins || [],
            before: x.runBeforePlugins || [],
            ref: x,
          };
        })
      )
    );
    await this.log.debug("Services run default order: {initOrder}", {
      initOrder: this._activeServices
        .map(
          (x) =>
            `[(${(x.runAfterPlugins || []).join(",")})${x.pluginName}(${(
              x.runBeforePlugins || []
            ).join(",")})]`
        )
        .join(","),
    });
    await this.log.debug("Services run order: {initOrder}", {
      initOrder: orderOfPlugins
        .map((x) => `[${x.after.join(",")}=>${x.name}=>${x.before.join(",")}]`)
        .join(","),
    });
    for (let service of orderOfPlugins) {
      await this.log.debug(`{plugin} run`, {
        plugin: service.name,
      });
      await service.ref.run();
    }
  }
}
