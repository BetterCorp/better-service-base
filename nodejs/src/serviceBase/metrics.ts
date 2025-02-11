/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.  
 * Copyright (C) 2024 BetterCorp (PTY) Ltd  
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

import { EventEmitter } from "node:events";
import { BSBMetrics, PluginLogging, SmartFunctionCallAsync, SmartFunctionCallSync } from "../base";
import { DEBUG_MODE, IPluginDefinition, IPluginLogging, LoadedPlugin } from "../interfaces";
import { SBConfig } from "./config";
import { SBLogging } from "./logging";
import { SBPlugins } from "./plugins";
import { createFakeDTrace, DTrace } from "../interfaces/metrics";

/**
 * @hidden
 */
function internalTrace(span: string): DTrace {
  return createFakeDTrace("serviceBase/SBMetrics", span);
}

/**
 * BSB Metrics Controller
 * @group Metrics
 * @category Extending BSB
 */
export class SBMetrics {
  private metricsPlugins: Array<BSBMetrics<any>> = [];
  public metricsBus: EventEmitter = new EventEmitter();
  private mode: DEBUG_MODE = "development";
  private appId: string;
  private cwd: string;
  private sbPlugins: SBPlugins;
  private log: IPluginLogging;
  private _ready = false;

  public get isReady() {
    return this._ready;
  }

  constructor(
    appId: string,
    mode: DEBUG_MODE,
    cwd: string,
    sbPlugins: SBPlugins,
    sbLogging: SBLogging,
  ) {
    this.appId = appId;
    this.mode = mode;
    this.cwd = cwd;
    this.sbPlugins = sbPlugins;
    const metricsPluginName = "core-metrics";
    this.log = new PluginLogging(this.mode, metricsPluginName, sbLogging);

    this.setupCounterEvents();
    this.setupGaugeEvents();
    this.setupHistogramEvents();
    this.setupTraceEvents();
    this.setupSpanEvents();
  }

  private setupCounterEvents() {
    this.metricsBus.on("createCounter", async (timestamp: number, pluginName: string, name: string, description: string, help: string, labels?: string[]) => {
      for (const plugin of this.metricsPlugins) {
        await SmartFunctionCallAsync(
          plugin,
          plugin.createCounter.bind(plugin),
          timestamp,
          pluginName,
          name,
          description,
          help,
          labels
        );
      }
    });

    this.metricsBus.on("updateCounter", async (timestamp: number, event: "inc", pluginName: string, name: string, value: number, labels?: Record<string, string>) => {
      for (const plugin of this.metricsPlugins) {
        await SmartFunctionCallAsync(
          plugin,
          plugin.updateCounter.bind(plugin),
          timestamp,
          event,
          pluginName,
          name,
          value,
          labels
        );
      }
    });
  }

  private setupGaugeEvents() {
    this.metricsBus.on("createGauge", async (timestamp: number, pluginName: string, name: string, description: string, help: string, labels?: string[]) => {
      for (const plugin of this.metricsPlugins) {
        await SmartFunctionCallAsync(
          plugin,
          plugin.createGauge.bind(plugin),
          timestamp,
          pluginName,
          name,
          description,
          help,
          labels
        );
      }
    });

    this.metricsBus.on("updateGauge", async (timestamp: number, event: "set" | "inc" | "dec", pluginName: string, name: string, value: number, labels?: Record<string, string>) => {
      for (const plugin of this.metricsPlugins) {
        await SmartFunctionCallAsync(
          plugin,
          plugin.updateGauge.bind(plugin),
          timestamp,
          event,
          pluginName,
          name,
          value,
          labels
        );
      }
    });
  }

  private setupHistogramEvents() {
    this.metricsBus.on("createHistogram", async (timestamp: number, pluginName: string, name: string, description: string, help: string, boundaries: number[], labels?: string[]) => {
      for (const plugin of this.metricsPlugins) {
        await SmartFunctionCallAsync(
          plugin,
          plugin.createHistogram.bind(plugin),
          timestamp,
          pluginName,
          name,
          description,
          help,
          boundaries,
          labels
        );
      }
    });

    this.metricsBus.on("updateHistogram", async (timestamp: number, event: "record", pluginName: string, name: string, value: number, labels?: Record<string, string>) => {
      for (const plugin of this.metricsPlugins) {
        await SmartFunctionCallAsync(
          plugin,
          plugin.updateHistogram.bind(plugin),
          timestamp,
          event,
          pluginName,
          name,
          value,
          labels
        );
      }
    });
  }

  private setupTraceEvents() {
    this.metricsBus.on("startTrace", async (timestamp: number, pluginName: string, traceId: string) => {
      for (const plugin of this.metricsPlugins) {
        await SmartFunctionCallAsync(
          plugin,
          plugin.startTrace.bind(plugin),
          timestamp,
          this.appId,
          pluginName,
          traceId
        );
      }
    });

    this.metricsBus.on("endTrace", async (timestamp: number, pluginName: string, traceId: string, attributes?: Record<string, string>) => {
      for (const plugin of this.metricsPlugins) {
        await SmartFunctionCallAsync(
          plugin,
          plugin.endTrace.bind(plugin),
          timestamp,
          this.appId,
          pluginName,
          traceId,
          attributes
        );
      }
    });
  }

  private setupSpanEvents() {
    this.metricsBus.on("startSpan", async (timestamp: number, pluginName: string, traceId: string, spanId: string, name: string, parentSpanId?: string, attributes?: Record<string, string>) => {
      for (const plugin of this.metricsPlugins) {
        await SmartFunctionCallAsync(
          plugin,
          plugin.startSpan.bind(plugin),
          timestamp,
          this.appId,
          pluginName,
          traceId,
          spanId,
          name,
          parentSpanId,
          attributes
        );
      }
    });

    this.metricsBus.on("endSpan", async (timestamp: number, pluginName: string, traceId: string, spanId: string, attributes?: Record<string, string>) => {
      for (const plugin of this.metricsPlugins) {
        await SmartFunctionCallAsync(
          plugin,
          plugin.endSpan.bind(plugin),
          timestamp,
          this.appId,
          pluginName,
          traceId,
          spanId,
          attributes
        );
      }
    });

    this.metricsBus.on("errorSpan", async (timestamp: number, pluginName: string, traceId: string, spanId: string, error: Error, attributes?: Record<string, string>) => {
      for (const plugin of this.metricsPlugins) {
        await SmartFunctionCallAsync(
          plugin,
          plugin.errorSpan.bind(plugin),
          timestamp,
          this.appId,
          pluginName,
          traceId,
          spanId,
          error,
          attributes
        );
      }
    });
  }

  public dispose() {
    for (const plugin of this.metricsPlugins) {
      if (plugin.dispose !== undefined) {
        SmartFunctionCallSync(
          plugin,
          plugin.dispose.bind(plugin)
        );
      }
    }
    this.metricsBus.removeAllListeners();
  }

  public async init(sbConfig: SBConfig) {
    const dTrace = internalTrace("init");
    this.log.debug(dTrace, "INIT SBMetrics");
    const plugins = await sbConfig.getMetricsPlugins(dTrace);
    for (const plugin of Object.keys(plugins)) {
      await this.addMetricsPlugin(sbConfig, {
        name: plugin,
        package: plugins[plugin].package,
        plugin: plugins[plugin].plugin,
        version: "",
      });
    }
    this._ready = true;
  }

  public async addPlugin(
    plugin: IPluginDefinition,
    reference: LoadedPlugin<"metrics">,
    config: any,
  ) {
    const dTrace = internalTrace("addPlugin");
    this.log.debug(dTrace, `Construct metrics plugin: {name}`, {
      name: plugin.name,
    });

    const metricsPlugin = new reference.plugin({
      appId: this.appId,
      mode: this.mode,
      pluginName: reference.name,
      cwd: this.cwd,
      packageCwd: reference.packageCwd,
      pluginCwd: reference.pluginCwd,
      config: config,
      pluginVersion: reference.version,
    });

    this.metricsPlugins.push(metricsPlugin);

    this.log.info(dTrace, "Ready {pluginName} ({mappedName})", {
      pluginName: plugin.plugin,
      mappedName: plugin.name,
    });

    if (metricsPlugin.init !== undefined) {
      await SmartFunctionCallAsync(
        metricsPlugin,
        metricsPlugin.init.bind(metricsPlugin),
        dTrace
      );
    }

    return metricsPlugin;
  }

  private async addMetricsPlugin(
    sbConfig: SBConfig,
    plugin: IPluginDefinition,
  ) {
    const dTrace = internalTrace("addMetricsPlugin");
    this.log.debug(dTrace, "Add metrics plugin {name} from ({package}){file}", {
      package: plugin.package ?? "-",
      name: plugin.name,
      file: plugin.plugin,
    });

    const newPlugin = await this.sbPlugins.loadPlugin<"metrics">(
      this.log,
      plugin.package ?? null,
      plugin.plugin,
      plugin.name,
    );
    if (newPlugin === null) {
      this.log.error(
        dTrace,
        "Failed to import metrics plugin: {name} from ({package}){file}",
        {
          package: plugin.package ?? "-",
          name: plugin.name,
          file: plugin.plugin,
        },
      );
      return;
    }

    this.log.debug(dTrace, `Get plugin config: {name}`, {
      name: plugin.name,
    });

    let pluginConfig =
      (
        await sbConfig.getPluginConfig(dTrace, "metrics", plugin.name)
      ) ?? null;

    if (
      newPlugin.serviceConfig?.validationSchema
    ) {
      this.log.debug(dTrace, "Validate plugin config: {name}", { name: plugin.name });
      pluginConfig = newPlugin.serviceConfig.validationSchema.parse(pluginConfig ?? undefined);
    }

    await this.addPlugin(plugin, newPlugin, pluginConfig);
  }
}