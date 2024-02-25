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

interface SortedPlugin {
  srcPluginName: string;
  pluginName: string;
  initBeforePlugins: string[];
  initAfterPlugins: string[];
  runBeforePlugins: string[];
  runAfterPlugins: string[];
  reference: BSBService;
  clients: Array<{
    srcPluginName: string;
    pluginName: string;
    initBeforePlugins: string[];
    initAfterPlugins: string[];
    runBeforePlugins: string[];
    runAfterPlugins: string[];
    reference: BSBServiceClient<any>;
  }>;
}

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

  private async remapDeps(
    sbConfig: SBConfig,
    ref: BSBService | BSBServiceClient
  ) {
    (ref as any).initBeforePlugins = await this.mapServicePlugins(
      sbConfig,
      ref.pluginName,
      ref.initBeforePlugins ?? []
    );
    (ref as any).initAfterPlugins = await this.mapServicePlugins(
      sbConfig,
      ref.pluginName,
      ref.initAfterPlugins ?? []
    );
    (ref as any).runBeforePlugins = await this.mapServicePlugins(
      sbConfig,
      ref.pluginName,
      ref.runBeforePlugins ?? []
    );
    (ref as any).runAfterPlugins = await this.mapServicePlugins(
      sbConfig,
      ref.pluginName,
      ref.runAfterPlugins ?? []
    );
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
    for (const activeService of this._activeServices) {
      await this.remapDeps(sbConfig, activeService);
      for (const client of activeService._clients) {
        this.log.debug("Construct {pluginName} client {clientName}", {
          pluginName: activeService.pluginName,
          clientName: client.pluginName,
        });
        await this.remapDeps(sbConfig, client);
        await this.setupPluginClient(
          sbConfig,
          sbLogging,
          sbEvents,
          activeService,
          client
        );
        this.log.debug(
          "Setup {pluginName} client {asOriginalPluginName} as {clientName}",
          {
            pluginName: activeService.pluginName,
            clientName: client.pluginName,
            asOriginalPluginName: (client as any)._pluginName,
          }
        );
      }
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
    this.log.debug("Create plugin client {clientName} in {serviceName}", {
      clientName: clientContext.pluginName,
      serviceName: context.pluginName,
    });
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
    } else {
      this.log.warn("Plugin {plugin} is not enabled", {
        plugin: contextPlugin.name,
      });
    }
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
      packageCwd: reference.packageCwd,
      pluginCwd: reference.pluginCwd,
      config: config,
      sbLogging: sbLogging,
      sbEvents: sbEvents,
    });
    this.log.debug("Adding {pluginName} as service", {
      pluginName: plugin.name,
    });

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

  private sortByInitDependencies(type: "init" | "run") {
    return (a: SortedPlugin, b: SortedPlugin): number => {
      // If a's initBeforePlugins include b's pluginName, a should come before b
      if (
        (type == "init" ? a.initBeforePlugins : a.runBeforePlugins).includes(
          b.pluginName
        )
      ) {
        return -1;
      }
      // If b's initBeforePlugins include a's pluginName, a should come after b
      else if (
        (type == "init" ? b.initBeforePlugins : b.runBeforePlugins).includes(
          a.pluginName
        )
      ) {
        return 1;
      }
      // If a's initAfterPlugins include b's pluginName, a should come after b
      else if (
        (type == "init" ? a.initAfterPlugins : a.runAfterPlugins).includes(
          b.pluginName
        )
      ) {
        return 1;
      }
      // If b's initAfterPlugins include a's pluginName, a should come before b
      else if (
        (type == "init" ? b.initAfterPlugins : b.runAfterPlugins).includes(
          a.pluginName
        )
      ) {
        return -1;
      }
      // Otherwise, maintain the order
      else {
        return 0;
      }
    };
  }

  public async sortAndRunOrInitPlugins(type: "init" | "run"): Promise<void> {
    const plugins = this.gatherListOfPlugins(type).sort(
      this.sortByInitDependencies(type)
    );

    this.log.debug("{key} plugins in order: {plugins}", {
      key: type,
      plugins: plugins.map((x) => x.pluginName).join(", "),
    });

    for (const plugin of plugins) {
      this.log.debug("{type} plugin {pluginName}", {
        type,
        pluginName: plugin.pluginName,
      });
      for (const client of plugin.clients) {
        this.log.debug("  -> {type} client {pluginName}", {
          type,
          pluginName: client.pluginName,
        });
        await SmartFunctionCallAsync(client.reference, client.reference[type]);
      }
      await SmartFunctionCallAsync(plugin.reference, plugin.reference[type]);
    }
  }

  private getTextReportedDeps(list: Array<string> | undefined): string {
    if (list === undefined) return "ANY";
    if (list.length === 0) return "ANY";
    return list.join(", ");
  }

  private gatherListOfPlugins(type: "init" | "run") {
    const list: Array<SortedPlugin> = [];
    for (const service of this._activeServices) {
      this.log.debug(
        "Mapping required plugins list for {plugin} [{key}BeforePlugins: {beforePlugins}][{key}AfterPlugins:{afterPlugins}]",
        {
          key: type,
          plugin: service.pluginName,
          beforePlugins: this.getTextReportedDeps(
            type === "init"
              ? service.initBeforePlugins
              : service.runBeforePlugins
          ),
          afterPlugins: this.getTextReportedDeps(
            type === "init" ? service.initAfterPlugins : service.runAfterPlugins
          ),
        }
      );
      const refPlugin: SortedPlugin = {
        srcPluginName: service.pluginName,
        pluginName: service.pluginName,
        initBeforePlugins: service.initBeforePlugins ?? [],
        initAfterPlugins: service.initAfterPlugins ?? [],
        runBeforePlugins: service.runBeforePlugins ?? [],
        runAfterPlugins: service.runAfterPlugins ?? [],
        reference: service,
        clients: [],
      };
      for (const client of service._clients) {
        this.log.debug(
          " -> {client} [{key}BeforePlugins:{beforePlugins}][{key}AfterPlugins:{afterPlugins}]",
          {
            key: type,
            client: client.pluginName,
            beforePlugins: this.getTextReportedDeps(
              type === "init"
                ? client.initBeforePlugins
                : client.runBeforePlugins
            ),
            afterPlugins: this.getTextReportedDeps(
              type === "init" ? client.initAfterPlugins : client.runAfterPlugins
            ),
          }
        );
        refPlugin.clients.push({
          srcPluginName: service.pluginName,
          pluginName: client.pluginName,
          initBeforePlugins: client.initBeforePlugins ?? [],
          initAfterPlugins: client.initAfterPlugins ?? [],
          runBeforePlugins: client.runBeforePlugins ?? [],
          runAfterPlugins: client.runAfterPlugins ?? [],
          reference: client,
        });
        refPlugin.initBeforePlugins = refPlugin.initBeforePlugins.concat(
          client.initBeforePlugins ?? []
        );
        refPlugin.initAfterPlugins = refPlugin.initAfterPlugins.concat(
          client.initAfterPlugins ?? []
        );
        refPlugin.runBeforePlugins = refPlugin.runBeforePlugins.concat(
          client.runBeforePlugins ?? []
        );
        refPlugin.runAfterPlugins = refPlugin.runAfterPlugins.concat(
          client.runAfterPlugins ?? []
        );
      }
      list.push(refPlugin);
    }
    return list;
  }
  public async init() {
    this.log.info("Init all services");
    await this.sortAndRunOrInitPlugins("init");
  }

  public async run() {
    this.log.info("Run all services");
    await this.sortAndRunOrInitPlugins("run");
  }
}
