/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.  
 * Copyright (C) 2016 - 2025 BetterCorp (PTY) Ltd  
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Alternatively, you may obtain a commercial license for this program. 
 * The commercial license allows you to use the Program in a closed-source manner, 
 * including the right to create derivative works that are not subject to the terms 
 * of the AGPL. 
 *
 * To obtain a commercial license, please contact the copyright holders at 
 * https://www.bettercorp.dev. The terms and conditions of the commercial license 
 * will be provided upon request.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  BSBService,
  BSBServiceClient,
  PluginEvents,
  ObservableBackend, SmartFunctionCallAsync,
  SmartFunctionCallSync, Tools,
  ResourceContextBuilder,
  PluginObservable,
} from "../base/index.js";
import { createFakeDTrace, DEBUG_MODE, DTrace, IPluginDefinition, IPluginObservable, LoadedPlugin, Observable } from "../interfaces/index.js";
import { SBConfig } from "./config.js";
import { SBEvents } from "./events.js";
import { SBObservable } from "./observable.js";
import { SBPlugins } from "./plugins.js";
import { parsePluginConfig } from "./plugin-config.js";

/**
 * @hidden
 */
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

/**
 * @hidden
 */
function internalTrace(span: string): DTrace {
  return createFakeDTrace("serviceBase/SBServices", span);
}

/**
 * BSB Services Controller
 * 
 * This class is responsible for managing the services in the BSB framework.
 * If you have a specific way of managing services, you can extend this class and then use your own class when creating the ServiceBase instance.
 * 
 * @group Services
 * @category Core
 */
export class SBServices {
  private _activeServices: Array<BSBService> = [];

  private readonly mode: DEBUG_MODE = "development";
  private readonly appId: string;
  private readonly cwd: string;
  private sbPlugins: SBPlugins;
  private readonly observableBackend: IPluginObservable;

  private readonly region?: string;

  constructor(
    appId: string,
    mode: DEBUG_MODE,
    cwd: string,
    sbPlugins: SBPlugins,
    sbObservable: SBObservable,
    region?: string,
  ) {
    this.appId = appId;
    this.mode = mode;
    this.cwd = cwd;
    this.sbPlugins = sbPlugins;
    this.region = region;
    const eventsPluginName = "core-services";
    this.observableBackend = new ObservableBackend(this.mode, appId, eventsPluginName, sbObservable);
  }

  public dispose() {
    for (const service of this._activeServices) {
      this.observableBackend.warn(internalTrace("dispose"), "disposing {service}", { service: service.pluginName });
      for (const client of service._clients) {
        SmartFunctionCallSync(client, client.dispose);
      }
      SmartFunctionCallSync(service, service.dispose);
    }
  }

  private async remapDeps(
    sbConfig: SBConfig,
    tTrace: DTrace,
    ref: BSBService | BSBServiceClient<any>,
  ) {
    (
      ref as any
    ).initBeforePlugins = await this.mapServicePlugins(
      sbConfig,
      tTrace,
      ref.pluginName,
      ref.initBeforePlugins ?? [],
    );
    (
      ref as any
    ).initAfterPlugins = await this.mapServicePlugins(
      sbConfig,
      tTrace,
      ref.pluginName,
      ref.initAfterPlugins ?? [],
    );
    (
      ref as any
    ).runBeforePlugins = await this.mapServicePlugins(
      sbConfig,
      tTrace,
      ref.pluginName,
      ref.runBeforePlugins ?? [],
    );
    (
      ref as any
    ).runAfterPlugins = await this.mapServicePlugins(
      sbConfig,
      tTrace,
      ref.pluginName,
      ref.runAfterPlugins ?? [],
    );
  }

  public async setup(
    sbConfig: SBConfig,
    sbObservable: SBObservable,
    sbEvents: SBEvents,
  ) {
    const tTrace = internalTrace("setup");
    this.observableBackend.debug(tTrace, "SETUP SBServices");
    const plugins = await sbConfig.getServicePlugins(tTrace);
    for (const plugin of Object.keys(plugins)) {
      await this.addService(sbConfig, sbObservable, sbEvents, {
        name: plugin,
        package: plugins[plugin].package,
        plugin: plugins[plugin].plugin,
        version: plugins[plugin].version ?? "",
      });
    }
    for (const activeService of this._activeServices) {
      await this.remapDeps(sbConfig, tTrace, activeService);
      for (const client of activeService._clients) {
        this.observableBackend.debug(tTrace, "Construct {pluginName} client {clientName}", {
          pluginName: activeService.pluginName,
          clientName: client.pluginName,
        });
        await this.remapDeps(sbConfig, tTrace, client);
        await this.setupPluginClient(
          sbConfig,
          sbObservable,
          sbEvents,
          activeService,
          client,
        );
        this.observableBackend.debug(tTrace,
          "Setup {pluginName} client {asOriginalPluginName} as {clientName}",
          {
            pluginName: activeService.pluginName,
            clientName: client.pluginName,
            asOriginalPluginName: (
              client as any
            )._pluginName,
          },
        );
      }
    }
    this.observableBackend.debug(tTrace, "SETUP SBServices: Completed");
  }

  private setupPluginClient = async (
    sbConfig: SBConfig,
    sbObservable: SBObservable,
    sbEvents: SBEvents,
    context: BSBService,
    clientContext: BSBServiceClient<any>,
  ): Promise<void> => {
    const tTrace = internalTrace("setupPluginClient");
    this.observableBackend.debug(tTrace, "Create plugin client {clientName} in {serviceName}", {
      clientName: clientContext.pluginName,
      serviceName: context.pluginName,
    });
    const contextPlugin = await sbConfig.getServicePluginDefinition(
      tTrace,
      clientContext.pluginName,
    );
    (
      clientContext as any
    )._pluginName = clientContext.pluginName;
    (
      clientContext as any
    ).pluginName = contextPlugin.name;
    (
      clientContext as any
    ).pluginEnabled = contextPlugin.enabled;
    // Create unified observable backend for client
    const clientObservableBackend = new ObservableBackend(
      this.mode,
      this.appId,
      contextPlugin.name,
      sbObservable,
    );

    (
      clientContext as any
    ).events = new PluginEvents(
      this.mode,
      sbEvents,
      clientContext,
      (clientContext as any).__clientEventSchemas ?? {},
      clientObservableBackend
    );

    // v9: Add resource context and createObservable method for clients
    const clientResourceContext = ResourceContextBuilder.build(
      {
        appId: this.appId,
        mode: this.mode,
        pluginName: contextPlugin.name,
        cwd: this.cwd,
        packageCwd: "", // Clients don't have their own package path
        pluginCwd: "", // Clients don't have their own plugin path
        pluginVersion: "client"
      },
      this.region
    );
    (clientContext as any)._resourceContext = clientResourceContext;
    (clientContext as any).createObservable = function(trace: DTrace, attributes?: Record<string, string | number | boolean>): Observable {
      return new PluginObservable(
        trace,
        clientResourceContext,
        clientObservableBackend,
        attributes
      );
    };

    if (!contextPlugin || !contextPlugin.enabled) {
      this.observableBackend.warn(tTrace, "Plugin {plugin} is not enabled", {
        plugin: contextPlugin.name,
      });
    }
  };

  private async mapServicePlugins(
    sbConfig: SBConfig,
    tTrace: DTrace,
    referencedPluginName: string,
    ...sourcePluginsList: Array<Array<string> | undefined>
  ): Promise<Array<string>> {
    const outlist = [];
    for (const pluginArr of sourcePluginsList.filter((x) => x !== undefined)) {
      for (const plugin of pluginArr!) {
        const pluginDef = await sbConfig.getServicePluginDefinition(tTrace, plugin);
        if (pluginDef.enabled !== true) {
          this.observableBackend.warn(tTrace, "The plugin {plugin} is not enabled for {pluginNeeded}. It may not work as expected.", {
            plugin: plugin,
            pluginNeeded: referencedPluginName,
          });
        }
        outlist.push(pluginDef.name);
      }
    }
    return outlist;
  }

  public async addPlugin(
    sbConfig: SBConfig,
    sbObservable: SBObservable,
    sbEvents: SBEvents,
    plugin: IPluginDefinition,
    reference: LoadedPlugin<"service">,
    config: any,
  ) {
    const tTrace = internalTrace("addPlugin");
    this.observableBackend.debug(tTrace, `Construct service plugin: {name}`, {
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
      sbObservable: sbObservable,
      sbEvents: sbEvents,
      pluginVersion: reference.version,
      region: this.region,
    });
    this.observableBackend.debug(tTrace, "Adding {pluginName} as service", {
      pluginName: plugin.name,
    });

    this._activeServices.push(servicePlugin);

    this.observableBackend.info(tTrace, "Ready {pluginName} ({mappedName})", {
      pluginName: plugin.plugin,
      mappedName: plugin.name,
    });

    return servicePlugin;
  }

  private async addService(
    sbConfig: SBConfig,
    sbObservable: SBObservable,
    sbEvents: SBEvents,
    plugin: IPluginDefinition,
  ) {
    const tTrace = internalTrace("addService");
    this.observableBackend.debug(tTrace, "Add service {name} from ({package}){file}", {
      package: plugin.package ?? "this project",
      name: plugin.name,
      file: plugin.plugin,
    });
    this.observableBackend.debug(tTrace, `Import service plugin: {name} from ({package}){file}`, {
      package: plugin.package ?? "this project",
      name: plugin.name,
      file: plugin.plugin,
    });

    const newPlugin = await this.sbPlugins.loadPlugin<"service">(
      this.observableBackend,
      plugin.package ?? null,
      plugin.plugin,
      plugin.name,
      plugin.version ?? null,
    );
    if (newPlugin === null || !newPlugin.success) {
      this.observableBackend.error(
        tTrace,
        "Failed to import service plugin: {name} from ({package}){file}",
        {
          package: plugin.package ?? "this project",
          name: plugin.name,
          file: plugin.plugin,
        },
      );
      return;
    }

    this.observableBackend.debug(tTrace, `Get plugin config: {name}`, {
      name: plugin.name,
    });

    let pluginConfig: object | null | undefined = undefined;
    const rawPluginConfig = await sbConfig.getPluginConfig(tTrace, "service", plugin.name);
    if (!Tools.isNullOrUndefined(newPlugin.data.serviceConfig?.validationSchema)) {
      this.observableBackend.debug(tTrace, "Validate plugin config: {name}", { name: plugin.name });
    }
    pluginConfig = parsePluginConfig(newPlugin.data.serviceConfig, rawPluginConfig);

    await this.addPlugin(
      sbConfig,
      sbObservable,
      sbEvents,
      plugin,
      newPlugin.data,
      pluginConfig,
    );
  }

  private sortByDependencies(plugins: SortedPlugin[], type: "init" | "run"): SortedPlugin[] {
    const dependencies = new Map(plugins.map(plugin => [plugin.pluginName, new Set<string>()]));
    for (const plugin of plugins) {
      const before = type === "init" ? plugin.initBeforePlugins : plugin.runBeforePlugins;
      const after = type === "init" ? plugin.initAfterPlugins : plugin.runAfterPlugins;
      for (const name of before) dependencies.get(name)?.add(plugin.pluginName);
      for (const name of after) {
        if (dependencies.has(name)) dependencies.get(plugin.pluginName)!.add(name);
      }
    }
    const result: SortedPlugin[] = [];
    // ponytail: quadratic in plugin count; use an indegree queue for thousands of services.
    while (dependencies.size > 0) {
      const next = plugins.find(plugin => dependencies.get(plugin.pluginName)?.size === 0);
      if (!next) throw new Error(`Service ${type} dependency cycle: ${[...dependencies.keys()].join(", ")}`);
      result.push(next);
      dependencies.delete(next.pluginName);
      for (const remaining of dependencies.values()) remaining.delete(next.pluginName);
    }
    return result;
  }

  public async sortAndRunOrInitPlugins(type: "init" | "run"): Promise<void> {
    const tTrace = internalTrace(`sortAndRunOrInitPlugins:${ type }`);
    const plugins = this.sortByDependencies(this.gatherListOfPlugins(type), type);

    this.observableBackend.debug(tTrace, "{key} plugins in order: {plugins}", {
      key: type,
      plugins: plugins.map((x) => x.pluginName)
        .join(", "),
    });

    for (const plugin of plugins) {
      this.observableBackend.debug(tTrace, "{type} plugin {pluginName}", {
        type,
        pluginName: plugin.pluginName,
      });

      // v9: Convert DTrace to Observable before calling plugin methods
      const obs = (plugin.reference as any).createObservable
        ? (plugin.reference as any).createObservable(tTrace)
        : tTrace;

      for (const client of plugin.clients) {
        this.observableBackend.debug(tTrace, "  -> {type} client {pluginName}", {
          type,
          pluginName: client.pluginName,
        });
        // For clients, try to get Observable from parent service
        const clientObs = (client.reference as any).createObservable
          ? (client.reference as any).createObservable(tTrace)
          : obs;
        await SmartFunctionCallAsync(client.reference, client.reference[type], clientObs);
      }
      await SmartFunctionCallAsync(plugin.reference, plugin.reference[type], obs);
    }
  }

  private getTextReportedDeps(list: Array<string> | undefined): string {
    if (list === undefined) {
      return "ANY";
    }
    if (list.length === 0) {
      return "ANY";
    }
    return list.join(", ");
  }

  private gatherListOfPlugins(type: "init" | "run") {
    const tTrace = internalTrace(`gatherListOfPlugins:${ type }`);
    const list: Array<SortedPlugin> = [];
    for (const service of this._activeServices) {
      this.observableBackend.debug(tTrace,
        "Mapping required plugins list for {plugin} [{key}BeforePlugins: {beforePlugins}][{key}AfterPlugins:{afterPlugins}]",
        {
          key: type,
          plugin: service.pluginName,
          beforePlugins: this.getTextReportedDeps(
            type === "init"
              ? service.initBeforePlugins
              : service.runBeforePlugins,
          ),
          afterPlugins: this.getTextReportedDeps(
            type === "init" ? service.initAfterPlugins : service.runAfterPlugins,
          ),
        },
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
        this.observableBackend.debug(tTrace,
          " -> {client} [{key}BeforePlugins:{beforePlugins}][{key}AfterPlugins:{afterPlugins}]",
          {
            key: type,
            client: client.pluginName,
            beforePlugins: this.getTextReportedDeps(
              type === "init"
                ? client.initBeforePlugins
                : client.runBeforePlugins,
            ),
            afterPlugins: this.getTextReportedDeps(
              type === "init" ? client.initAfterPlugins : client.runAfterPlugins,
            ),
          },
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
          client.initBeforePlugins ?? [],
        );
        refPlugin.initAfterPlugins = refPlugin.initAfterPlugins.concat(
          client.initAfterPlugins ?? [],
        );
        refPlugin.runBeforePlugins = refPlugin.runBeforePlugins.concat(
          client.runBeforePlugins ?? [],
        );
        refPlugin.runAfterPlugins = refPlugin.runAfterPlugins.concat(
          client.runAfterPlugins ?? [],
        );
      }
      list.push(refPlugin);
    }
    return list;
  }

  public async init() {
    this.observableBackend.info(internalTrace("init"), "Init all services");
    await this.sortAndRunOrInitPlugins("init");
  }

  public async run() {
    this.observableBackend.info(internalTrace("run"), "Run all services");
    await this.sortAndRunOrInitPlugins("run");
  }
}
