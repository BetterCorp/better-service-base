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
  type: "service" | "client";
  srcPluginName: string;
  pluginName: string;
  initBeforePlugins?: string[];
  initAfterPlugins?: string[];
  runBeforePlugins?: string[];
  runAfterPlugins?: string[];
  reference: BSBService | BSBServiceClient<any>;
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
      pluginCwd: reference.pluginCWD,
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

  public async init() {
    this.log.info("Init all services");
    const list: Array<SortedPlugin> = [];
    for (const service of this._activeServices) {
      this.log.debug(
        "Mapping required plugins list for {plugin} [initBeforePlugins:{initBeforePlugins}][initAfterPlugins:{initAfterPlugins}]",
        {
          plugin: service.pluginName,
          initBeforePlugins: this.getTextReportedDeps(
            service.initBeforePlugins
          ),
          initAfterPlugins: this.getTextReportedDeps(service.initAfterPlugins),
        }
      );
      list.push({
        type: "service",
        srcPluginName: service.pluginName,
        pluginName: service.pluginName,
        initBeforePlugins: service.initBeforePlugins,
        initAfterPlugins: service.initAfterPlugins,
        runBeforePlugins: service.runBeforePlugins,
        runAfterPlugins: service.runAfterPlugins,
        reference: service,
      });
      for (const client of service._clients) {
        this.log.debug(
          " - {plugin} -> {client} [initBeforePlugins:{initBeforePlugins}][initAfterPlugins:{initAfterPlugins}]",
          {
            plugin: service.pluginName,
            client: client.pluginName,
            initBeforePlugins: this.getTextReportedDeps(
              client.initBeforePlugins
            ),
            initAfterPlugins: this.getTextReportedDeps(client.initAfterPlugins),
          }
        );
        list.push({
          type: "client",
          srcPluginName: service.pluginName,
          pluginName: client.pluginName,
          initBeforePlugins: client.initBeforePlugins,
          initAfterPlugins: client.initAfterPlugins,
          runBeforePlugins: client.runBeforePlugins,
          runAfterPlugins: client.runAfterPlugins,
          reference: client,
        });
      }
    }
    await this.sortAndRunOrInitPlugins(list, "init");
  }

  public async sortAndRunOrInitPlugins(
    plugins: SortedPlugin[],
    type: "init" | "run"
  ): Promise<void> {
    // Create a map to hold the plugins by name for easy access
    const pluginMap = new Map<string, SortedPlugin>();
    for (let i = 0; i < plugins.length; i++) {
      pluginMap.set(plugins[i].pluginName, plugins[i]);
    }

    // Function to visit each plugin and resolve dependencies
    const visitPlugin = (
      plugin: SortedPlugin,
      resolved: SortedPlugin[],
      unresolved: SortedPlugin[]
    ): void => {
      unresolved.push(plugin);
      const before =
        (type === "init"
          ? plugin.initBeforePlugins
          : plugin.runBeforePlugins) ?? [];
      for (let i = 0; i < before.length; i++) {
        const beforePluginName = before[i];
        const beforePlugin = pluginMap.get(beforePluginName);
        if (!beforePlugin) {
          throw new Error(
            `Plugin ${beforePluginName} required by ${plugin.pluginName} not found`
          );
        }
        if (!resolved.includes(beforePlugin)) {
          if (unresolved.includes(beforePlugin)) {
            throw new BSBError(
              "Circular dependency detected: {plugin1}<>{plugin2}",
              {
                plugin1: plugin.pluginName,
                plugin2: beforePlugin.pluginName,
              }
            );
          }
          visitPlugin(beforePlugin, resolved, unresolved);
        }
      }
      resolved.push(plugin);
      unresolved.splice(unresolved.indexOf(plugin), 1);
    };

    // The array to hold the sorted plugins
    const sortedPlugins: SortedPlugin[] = [];

    // Visit each plugin and resolve dependencies
    for (let i = 0; i < plugins.length; i++) {
      if (!sortedPlugins.includes(plugins[i])) {
        visitPlugin(plugins[i], sortedPlugins, []);
      }
    }

    // Once sorted, run each plugin in order
    for (let i = 0; i < sortedPlugins.length; i++) {
      this.log.debug(
        "Plugin {pluginName}({ptype}) trigger {type} before {beforePlugins} and after {afterPlugins}",
        {
          ptype:
            sortedPlugins[i].type +
            (sortedPlugins[i].type === "client"
              ? ` on ${sortedPlugins[i].srcPluginName}`
              : ""),
          pluginName: sortedPlugins[i].pluginName,
          type,
          beforePlugins: this.getTextReportedDeps(
            type === "init"
              ? sortedPlugins[i].initBeforePlugins
              : sortedPlugins[i].runBeforePlugins
          ),
          afterPlugins: this.getTextReportedDeps(
            type === "init"
              ? sortedPlugins[i].initAfterPlugins
              : sortedPlugins[i].runAfterPlugins
          ),
        }
      );
      await SmartFunctionCallAsync(
        sortedPlugins[i].reference,
        sortedPlugins[i].reference[type]
      );
    }
  }

  private getTextReportedDeps(list: Array<string> | undefined): string {
    if (list === undefined) return "ANY";
    if (list.length === 0) return "ANY";
    return list.join(", ");
  }
  public async run() {
    this.log.info("Run all services");
    const list: Array<SortedPlugin> = [];
    for (const service of this._activeServices) {
      this.log.debug(
        "Mapping required plugins list for {plugin} [runBeforePlugins:{runBeforePlugins}][runAfterPlugins:{runAfterPlugins}]",
        {
          plugin: service.pluginName,
          runBeforePlugins: this.getTextReportedDeps(service.runBeforePlugins),
          runAfterPlugins: this.getTextReportedDeps(service.runAfterPlugins),
        }
      );
      list.push({
        type: "service",
        srcPluginName: service.pluginName,
        pluginName: service.pluginName,
        initBeforePlugins: service.initBeforePlugins,
        initAfterPlugins: service.initAfterPlugins,
        runBeforePlugins: service.runBeforePlugins,
        runAfterPlugins: service.runAfterPlugins,
        reference: service,
      });
      for (const client of service._clients) {
        this.log.debug(
          " - {plugin} -> {client} [runBeforePlugins:{runBeforePlugins}][runAfterPlugins:{runAfterPlugins}]",
          {
            plugin: service.pluginName,
            client: client.pluginName,
            runBeforePlugins: this.getTextReportedDeps(client.runBeforePlugins),
            runAfterPlugins: this.getTextReportedDeps(client.runAfterPlugins),
          }
        );
        list.push({
          type: "client",
          srcPluginName: service.pluginName,
          pluginName: client.pluginName,
          initBeforePlugins: client.initBeforePlugins,
          initAfterPlugins: client.initAfterPlugins,
          runBeforePlugins: client.runBeforePlugins,
          runAfterPlugins: client.runAfterPlugins,
          reference: client,
        });
      }
    }
    await this.sortAndRunOrInitPlugins(list, "run");
  }
}
