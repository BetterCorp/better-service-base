import {
  BSBService,
  PluginLogger,
  IPluginLogger,
  DEBUG_MODE,
  SBConfig,
  SBEvents,
  SmartFunctionCallAsync,
  SmartFunctionCallSync,
  SBLogging,
  SBPlugins,
  IPluginDefinition,
  BSBError,
  BSBServiceClient,
  PluginEvents,
  LoadedPlugin,
  SmartFunctionCallThroughAsync,
} from "../";
import { Tools } from "@bettercorp/tools/lib/Tools";

export class SBServices {
  private _activeServices: Array<BSBService> = [];

  private mode: DEBUG_MODE = "development";
  private appId: string;
  private cwd: string;
  private sbPlugins: SBPlugins;
  private log: IPluginLogger;
  constructor(
    appId: string,
    mode: DEBUG_MODE,
    cwd: string,
    sbPlugins: SBPlugins,
    sbLogging: SBLogging
  ) {
    this.appId = appId;
    this.mode = mode;
    this.cwd = cwd;
    this.sbPlugins = sbPlugins;
    const eventsPluginName = "core-services";
    this.log = new PluginLogger(this.mode, eventsPluginName, sbLogging);
  }

  public dispose() {
    for (const service of this._activeServices) {
      this.log.warn("disposing {service}", { service: service.pluginName });
      for (const client of service._clients) {
        SmartFunctionCallSync(client, client.dispose);
      }
      SmartFunctionCallSync(service, service.dispose);
    }
  }

  public async setup(
    sbConfig: SBConfig,
    sbLogging: SBLogging,
    sbEvents: SBEvents
  ) {
    this.log.debug("SETUP SBServices");
    const plugins = await sbConfig.getServicePlugins();
    for (const plugin of Object.keys(plugins)) {
      await this.addService(sbConfig, sbLogging, sbEvents, {
        name: plugin,
        package: plugins[plugin].package,
        plugin: plugins[plugin].plugin,
        version: "",
      });
    }
    this.log.debug("SETUP SBServices: Completed");
  }

  private setupPluginClient = async (
    sbConfig: SBConfig,
    sbLogging: SBLogging,
    sbEvents: SBEvents,
    context: BSBService,
    clientContext: BSBServiceClient<any>
  ): Promise<void> => {
    const contextPlugin = await sbConfig.getServicePluginDefinition(
      clientContext.pluginName
    );
    (clientContext as any)._pluginName = clientContext.pluginName;
    (clientContext as any).pluginName = contextPlugin.name;
    (clientContext as any).pluginEnabled = contextPlugin.enabled;
    (clientContext as any).log = new PluginLogger(
      this.mode,
      contextPlugin.name,
      sbLogging
    );
    (clientContext as any).events = new PluginEvents(
      this.mode,
      sbEvents,
      clientContext
    );
    (context as any).initBeforePlugins = (
      context.initBeforePlugins ?? []
    ).concat(clientContext.initBeforePlugins ?? []);
    (context as any).initAfterPlugins = (context.initAfterPlugins ?? []).concat(
      clientContext.initAfterPlugins ?? []
    );
    (context as any).runBeforePlugins = (context.runBeforePlugins ?? []).concat(
      clientContext.runBeforePlugins ?? []
    );
    (context as any).runAfterPlugins = (context.runAfterPlugins ?? []).concat(
      clientContext.runAfterPlugins ?? []
    );
  };

  private async mapServicePlugins(
    sbConfig: SBConfig,
    referencedPluginName: string,
    ...sourcePluginsList: Array<Array<string> | undefined>
  ): Promise<Array<string>> {
    const outlist = [];
    for (const pluginArr of sourcePluginsList.filter((x) => x !== undefined)) {
      for (const plugin of pluginArr!) {
        const pluginDef = await sbConfig.getServicePluginDefinition(plugin);
        if (pluginDef.enabled !== true)
          throw new BSBError(
            "PLUGIN_NOT_ENABLED",
            "The plugin {plugin} is not enabled for {pluginNeeded} to work.",
            {
              plugin: plugin,
              pluginNeeded: referencedPluginName,
            }
          );
        outlist.push(pluginDef.name);
      }
    }
    return outlist;
  }
  public async addPlugin(
    sbConfig: SBConfig,
    sbLogging: SBLogging,
    sbEvents: SBEvents,
    plugin: IPluginDefinition,
    reference: LoadedPlugin<"service">,
    config: any
  ) {
    this.log.debug(`Construct service plugin: {name}`, {
      name: plugin.name,
    });

    const servicePlugin = new reference.plugin({
      appId: this.appId,
      mode: this.mode,
      pluginName: reference.name,
      cwd: this.cwd,
      pluginCwd: reference.pluginCWD,
      config: config,
      sbLogging: sbLogging,
      sbEvents: sbEvents,
    });
    this.log.debug("Adding {pluginName} as service", {
      pluginName: plugin.name,
    });

    for (const client of servicePlugin._clients) {
      this.log.debug("Construct {pluginName} client {clientName}", {
        pluginName: plugin.name,
        clientName: client.pluginName,
      });
      await this.setupPluginClient(
        sbConfig,
        sbLogging,
        sbEvents,
        servicePlugin,
        client
      );
      this.log.debug(
        "Setup {pluginName} client {asOriginalPluginName} as {clientName}",
        {
          pluginName: plugin.name,
          clientName: client.pluginName,
          asOriginalPluginName: (client as any)._pluginName,
        }
      );
    }

    this._activeServices.push(servicePlugin);

    this.log.info("Ready {pluginName} ({mappedName})", {
      pluginName: plugin.plugin,
      mappedName: plugin.name,
    });

    return servicePlugin;
  }

  private async addService(
    sbConfig: SBConfig,
    sbLogging: SBLogging,
    sbEvents: SBEvents,
    plugin: IPluginDefinition
  ) {
    this.log.debug("Add service {name} from ({package}){file}", {
      package: plugin.package ?? "this project",
      name: plugin.name,
      file: plugin.plugin,
    });
    this.log.debug(`Import service plugin: {name} from ({package}){file}`, {
      package: plugin.package ?? "this project",
      name: plugin.name,
      file: plugin.plugin,
    });

    const newPlugin = await this.sbPlugins.loadPlugin<"service">(
      this.log,
      plugin.package ?? null,
      plugin.plugin,
      plugin.name
    );
    if (newPlugin === null) {
      this.log.error(
        "Failed to import service plugin: {name} from ({package}){file}",
        {
          package: plugin.package ?? "this project",
          name: plugin.name,
          file: plugin.plugin,
        }
      );
      return;
    }

    this.log.debug(`Get plugin config: {name}`, {
      name: plugin.name,
    });

    let pluginConfig =
      (await sbConfig.getPluginConfig("service", plugin.name)) ?? null;

    if (
      this.mode !== "production" &&
      !Tools.isNullOrUndefined(newPlugin) &&
      !Tools.isNullOrUndefined(newPlugin.serviceConfig) &&
      Tools.isObject(newPlugin.serviceConfig) &&
      !Tools.isNullOrUndefined(newPlugin.serviceConfig.validationSchema)
    ) {
      this.log.debug("Validate plugin config: {name}", { name: plugin.name });
      pluginConfig =
        newPlugin.serviceConfig.validationSchema.parse(pluginConfig);
    }

    await this.addPlugin(
      sbConfig,
      sbLogging,
      sbEvents,
      plugin,
      newPlugin,
      pluginConfig
    );
  }

  private initPluginClient = async (
    sbConfig: SBConfig,
    clientContext: BSBServiceClient<any>
  ): Promise<void> => {
    const contextPlugin = await sbConfig.getServicePluginDefinition(
      (clientContext as any)._pluginName
    );
    if (contextPlugin.enabled) {
      const referencedServiceContext = this._activeServices.find(
        (x) => x.pluginName === contextPlugin.name
      ) as BSBService;
      if (referencedServiceContext === undefined) {
        throw new BSBError(
          "The plugin {plugin} is not enabled so you cannot call methods from it",
          {
            plugin: contextPlugin.name,
          }
        );
      }
      if (referencedServiceContext.methods === null) {
        throw new BSBError(
          "The plugin {plugin} does not have any callable methods",
          {
            plugin: contextPlugin.name,
          }
        );
      }
      (clientContext as any).callMethod = (
        method: string,
        ...args: Array<any>
      ) => {
        if (referencedServiceContext.methods[method] === undefined) {
          throw new BSBError(
            "The plugin {plugin} does not have a method called {method}",
            {
              plugin: contextPlugin.name,
              method,
            }
          );
        }
        return SmartFunctionCallThroughAsync(
          referencedServiceContext,
          referencedServiceContext.methods[method],
          ...args
        );
      };
    }
    await SmartFunctionCallSync(clientContext, clientContext.init);
  };

  public async init(sbConfig: SBConfig) {
    this.log.info("Init all services");
    for (const service of this._activeServices) {
      this.log.debug("Mapping required plugins list for {plugin}", {
        plugin: service.pluginName,
      });
      (service as any).initBeforePlugins = await this.mapServicePlugins(
        sbConfig,
        service.pluginName,
        service.initBeforePlugins
      );
      (service as any).initAfterPlugins = await this.mapServicePlugins(
        sbConfig,
        service.pluginName,
        service.initAfterPlugins ?? []
      );
    }
    this.log.info("Defining service order");
    const orderOfPlugins = await this.makeAfterRequired(
      await this.makeBeforeRequired(
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
    this.log.debug("Services init default order: {initOrder}", {
      initOrder: this._activeServices
        .map(
          (x) =>
            `[(${(x.initAfterPlugins || []).join(",")})${x.pluginName}(${(
              x.initBeforePlugins || []
            ).join(",")})]`
        )
        .join(","),
    });
    this.log.debug("Services init order: {initOrder}", {
      initOrder: orderOfPlugins
        .map((x) => `[(${x.after.join(",")})${x.name}(${x.before.join(",")})]`)
        .join(","),
    });
    for (const service of orderOfPlugins) {
      this.log.debug(`Init {plugin}`, {
        plugin: service.name,
      });
      for (const client of service.ref._clients) {
        await this.initPluginClient(sbConfig, client);
      }
      SmartFunctionCallAsync(service.ref, service.ref.init);
    }
  }

  public async makeBeforeRequired(
    orderOfPlugins: {
      name: string;
      after: string[];
      before: string[];
      ref: BSBService;
    }[]
  ) {
    for (let i = 0; i < orderOfPlugins.length; i++) {
      if (orderOfPlugins[i].before.length === 0) continue;
      for (const bPlugin of orderOfPlugins[i].before)
        for (let j = 0; j < orderOfPlugins.length; j++) {
          if (orderOfPlugins[j].name == bPlugin) {
            orderOfPlugins[j].after.push(orderOfPlugins[i].name);
          }
        }
    }
    return orderOfPlugins;
  }
  public async makeAfterRequired(
    orderOfPlugins: {
      name: string;
      after: string[];
      before: string[];
      ref: BSBService;
    }[]
  ) {
    for (let i = 0; i < orderOfPlugins.length - 1; i++) {
      for (let j = i + 1; j < orderOfPlugins.length; j++) {
        if (orderOfPlugins[i].after.indexOf(orderOfPlugins[j].name) >= 0) {
          const temp = orderOfPlugins[i];
          orderOfPlugins[i] = orderOfPlugins[j];
          orderOfPlugins[j] = temp;
        }
      }
    }
    return orderOfPlugins;
  }

  public async run(sbConfig: SBConfig) {
    this.log.info("Run all services");
    for (const service of this._activeServices) {
      this.log.debug("Mapping required plugins list for {plugin}", {
        plugin: service.pluginName,
      });
      (service as any).runBeforePlugins = await this.mapServicePlugins(
        sbConfig,
        service.pluginName,
        service.runBeforePlugins ?? []
      );
      (service as any).runAfterPlugins = await this.mapServicePlugins(
        sbConfig,
        service.pluginName,
        service.runAfterPlugins ?? []
      );
    }
    this.log.info("Defining service order");
    const orderOfPlugins = await this.makeAfterRequired(
      await this.makeBeforeRequired(
        this._activeServices.map((x) => {
          return {
            name: x.pluginName,
            after: x.runBeforePlugins || [],
            before: x.runAfterPlugins || [],
            ref: x,
          };
        })
      )
    );
    this.log.debug("Services run default order: {runOrder}", {
      runOrder: this._activeServices
        .map(
          (x) =>
            `[(${(x.runBeforePlugins || []).join(",")})${x.pluginName}(${(
              x.runAfterPlugins || []
            ).join(",")})]`
        )
        .join(","),
    });
    this.log.debug("Services run order: {runOrder}", {
      runOrder: orderOfPlugins
        .map((x) => `[(${x.after.join(",")})${x.name}(${x.before.join(",")})]`)
        .join(","),
    });
    for (const service of orderOfPlugins) {
      this.log.debug(`Run {plugin}`, {
        plugin: service.name,
      });
      for (const client of service.ref._clients) {
        SmartFunctionCallAsync(client, client.run);
      }
      SmartFunctionCallAsync(service.ref, service.ref.run);
    }
  }
}
