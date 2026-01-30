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

import { EventEmitter } from "node:events";
import { BSBObservable, PluginLogging, SmartFunctionCallAsync, BSBError } from "../base";
import {
  DEBUG_MODE,
  FilterOnType,
  IPluginLogging,
  ObservableEventTypes,
  ObservableFilter,
  LogMeta,
} from "../interfaces";
import { createFakeDTrace, DTrace } from "../interfaces/metrics";
import { SBConfig } from "./config";
import { SBPlugins } from "./plugins";

/**
 * @hidden
 */
function internalTrace(span: string): DTrace {
  return createFakeDTrace("serviceBase/SBObservable", span);
}

/**
 * BSB Observable Controller - Unified logging, metrics, and tracing
 *
 * This class is responsible for managing all observability in the BSB framework.
 * If you have a specific way of managing observability, you can extend this class and then use your own class when creating the ServiceBase instance.
 *
 * @group Observable
 * @category Core
 */
export class SBObservable {
  /**
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/SBObservable.html | API: SBObservable}
   */
  private observablePlugins: Array<{
    plugin: BSBObservable<any>;
    on?: ObservableFilter;
    onTypeof: FilterOnType;
  }> = [];
  public observableBus: EventEmitter = new EventEmitter();
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
  ) {
    this.appId = appId;
    this.mode = mode;
    this.cwd = cwd;
    this.sbPlugins = sbPlugins;
    const observablePluginName = "core-observable";
    this.log = new PluginLogging(this.mode, observablePluginName, this);

    // Setup logging events
    if (this.mode !== "production") {
      this.observableBus.on("debug", (plugin: string, trace: DTrace, message: string, meta: LogMeta<any>) => {
        this.triggerEvent("debug", plugin, trace, message, meta);
      });
    }
    this.observableBus.on("info", (plugin: string, trace: DTrace, message: string, meta: LogMeta<any>) => {
      this.triggerEvent("info", plugin, trace, message, meta);
    });
    this.observableBus.on("warn", (plugin: string, trace: DTrace, message: string, meta: LogMeta<any>) => {
      this.triggerEvent("warn", plugin, trace, message, meta);
    });
    this.observableBus.on("error", (plugin: string, trace: DTrace, message: string | BSBError<any>, meta?: LogMeta<any>) => {
      this.triggerEvent("error", plugin, trace, message, meta);
    });

    // Setup metrics events
    this.setupCounterEvents();
    this.setupGaugeEvents();
    this.setupHistogramEvents();
    this.setupSpanEvents();
  }

  private setupCounterEvents() {
    this.observableBus.on("createCounter", async (timestamp: number, pluginName: string, name: string, description: string, help: string, labels?: string[]) => {
      this.triggerMetricEvent("counter", async (plugin) => {
        await SmartFunctionCallAsync(
          plugin,
          plugin.createCounter?.bind(plugin),
          timestamp,
          pluginName,
          name,
          description,
          help,
          labels
        );
      });
    });

    this.observableBus.on("incrementCounter", async (timestamp: number, pluginName: string, name: string, value: number, labels?: Record<string, string>) => {
      this.triggerMetricEvent("counter", async (plugin) => {
        await SmartFunctionCallAsync(
          plugin,
          plugin.incrementCounter?.bind(plugin),
          timestamp,
          pluginName,
          name,
          value,
          labels
        );
      });
    });
  }

  private setupGaugeEvents() {
    this.observableBus.on("createGauge", async (timestamp: number, pluginName: string, name: string, description: string, help: string, labels?: string[]) => {
      this.triggerMetricEvent("gauge", async (plugin) => {
        await SmartFunctionCallAsync(
          plugin,
          plugin.createGauge?.bind(plugin),
          timestamp,
          pluginName,
          name,
          description,
          help,
          labels
        );
      });
    });

    this.observableBus.on("setGauge", async (timestamp: number, pluginName: string, name: string, value: number, labels?: Record<string, string>) => {
      this.triggerMetricEvent("gauge", async (plugin) => {
        await SmartFunctionCallAsync(
          plugin,
          plugin.setGauge?.bind(plugin),
          timestamp,
          pluginName,
          name,
          value,
          labels
        );
      });
    });
  }

  private setupHistogramEvents() {
    this.observableBus.on("createHistogram", async (timestamp: number, pluginName: string, name: string, description: string, help: string, boundaries?: number[], labels?: string[]) => {
      this.triggerMetricEvent("histogram", async (plugin) => {
        await SmartFunctionCallAsync(
          plugin,
          plugin.createHistogram?.bind(plugin),
          timestamp,
          pluginName,
          name,
          description,
          help,
          boundaries,
          labels
        );
      });
    });

    this.observableBus.on("observeHistogram", async (timestamp: number, pluginName: string, name: string, value: number, labels?: Record<string, string>) => {
      this.triggerMetricEvent("histogram", async (plugin) => {
        await SmartFunctionCallAsync(
          plugin,
          plugin.observeHistogram?.bind(plugin),
          timestamp,
          pluginName,
          name,
          value,
          labels
        );
      });
    });
  }

  private setupSpanEvents() {
    this.observableBus.on("spanStart", async (trace: DTrace, pluginName: string, spanName: string, attributes?: Record<string, string | number | boolean>) => {
      this.triggerSpanEvent("spanStart", async (plugin) => {
        await SmartFunctionCallAsync(
          plugin,
          plugin.spanStart?.bind(plugin),
          trace,
          pluginName,
          spanName,
          attributes
        );
      });
    });

    this.observableBus.on("spanEnd", async (trace: DTrace, pluginName: string, attributes?: Record<string, string | number | boolean>) => {
      this.triggerSpanEvent("spanEnd", async (plugin) => {
        await SmartFunctionCallAsync(
          plugin,
          plugin.spanEnd?.bind(plugin),
          trace,
          pluginName,
          attributes
        );
      });
    });

    this.observableBus.on("spanError", async (trace: DTrace, pluginName: string, error: Error, attributes?: Record<string, string | number | boolean>) => {
      this.triggerSpanEvent("spanError", async (plugin) => {
        await SmartFunctionCallAsync(
          plugin,
          plugin.spanError?.bind(plugin),
          trace,
          pluginName,
          error,
          attributes
        );
      });
    });
  }

  private triggerEvent(
    eventType: "debug" | "info" | "warn" | "error",
    pluginName: string,
    trace: DTrace,
    message: string | BSBError<any>,
    meta?: LogMeta<any>
  ) {
    for (const observablePlugin of this.observablePlugins) {
      if (!this.shouldTriggerForPlugin(eventType, pluginName, observablePlugin)) {
        continue;
      }

      const method = observablePlugin.plugin[eventType];
      if (method) {
        SmartFunctionCallAsync(
          observablePlugin.plugin,
          method.bind(observablePlugin.plugin),
          trace,
          pluginName,
          message,
          meta
        );
      }
    }
  }

  private async triggerMetricEvent(
    eventType: "counter" | "gauge" | "histogram",
    executor: (plugin: BSBObservable<any>) => Promise<void>
  ) {
    for (const observablePlugin of this.observablePlugins) {
      if (!this.shouldTriggerForPlugin(eventType, "", observablePlugin)) {
        continue;
      }

      await executor(observablePlugin.plugin);
    }
  }

  private async triggerSpanEvent(
    eventType: "spanStart" | "spanEnd" | "spanError",
    executor: (plugin: BSBObservable<any>) => Promise<void>
  ) {
    for (const observablePlugin of this.observablePlugins) {
      if (!this.shouldTriggerForPlugin(eventType, "", observablePlugin)) {
        continue;
      }

      await executor(observablePlugin.plugin);
    }
  }

  private shouldTriggerForPlugin(
    eventType: ObservableEventTypes,
    pluginName: string,
    observablePlugin: { plugin: BSBObservable<any>; on?: ObservableFilter; onTypeof: FilterOnType }
  ): boolean {
    if (observablePlugin.onTypeof === "all") {
      return true;
    }

    if (observablePlugin.on === undefined) {
      return true;
    }

    // Handle array filter (events)
    if (Array.isArray(observablePlugin.on)) {
      return observablePlugin.on.includes(eventType);
    }

    // Handle object filters
    const filterValue = observablePlugin.on[eventType];

    if (filterValue === undefined) {
      return false;
    }

    // eventsState: Record<EventType, boolean>
    if (typeof filterValue === "boolean") {
      return filterValue;
    }

    // eventsPlugins: Record<EventType, Array<string>>
    if (Array.isArray(filterValue)) {
      return filterValue.includes(pluginName);
    }

    // eventsDetailed: Record<EventType, { plugins: Array<string>; enabled: boolean }>
    if (typeof filterValue === "object" && "enabled" in filterValue) {
      const detailed = filterValue as { plugins: Array<string>; enabled: boolean };
      if (!detailed.enabled) {
        return false;
      }
      if (detailed.plugins.length === 0) {
        return true;
      }
      return detailed.plugins.includes(pluginName);
    }

    return false;
  }

  private determineFilterType(filter?: ObservableFilter): FilterOnType {
    if (!filter) {
      return "all";
    }

    if (Array.isArray(filter)) {
      return "events";
    }

    const keys = Object.keys(filter);
    if (keys.length === 0) {
      return "all";
    }

    const firstValue = filter[keys[0] as ObservableEventTypes];

    if (typeof firstValue === "boolean") {
      return "eventsState";
    }

    if (Array.isArray(firstValue)) {
      return "eventsPlugins";
    }

    if (typeof firstValue === "object" && "enabled" in firstValue) {
      return "eventsDetailed";
    }

    return "all";
  }

  public async setupObservablePlugins(sbConfig: SBConfig) {
    const trace = internalTrace("setupObservablePlugins");

    this.log.info(trace, "Setting up observable plugins");
    const observablePluginsFromConfig = await sbConfig.getObservablePlugins(trace);

    for (const pluginKey of Object.keys(observablePluginsFromConfig)) {
      const pluginDef = observablePluginsFromConfig[pluginKey];
      if (!pluginDef.enabled) {
        this.log.info(trace, "Observable plugin {plugin} is disabled", { plugin: pluginKey });
        continue;
      }

      try {
        const loadResult = await this.sbPlugins.loadPlugin<"observable">(
          this.log,
          pluginDef.package ?? null,
          pluginDef.plugin,
          pluginKey
        );

        if (!loadResult || !loadResult.success) {
          this.log.error(trace, "Failed to load observable plugin {plugin}", { plugin: pluginKey });
          continue;
        }

        const loadedPlugin = loadResult.data;

        this.log.info(trace, "Loaded observable plugin {plugin} from {package}", {
          plugin: pluginKey,
          package: loadedPlugin.packageCwd,
        });

        const config = await sbConfig.getPluginConfig(trace, "observable", pluginKey);

        const observablePlugin = new loadedPlugin.plugin({
          appId: this.appId,
          mode: this.mode,
          pluginName: pluginKey,
          cwd: this.cwd,
          packageCwd: loadedPlugin.packageCwd,
          pluginCwd: loadedPlugin.pluginCwd,
          pluginVersion: loadedPlugin.version,
          config,
        });

        this.observablePlugins.push({
          plugin: observablePlugin,
          on: pluginDef.filter,
          onTypeof: this.determineFilterType(pluginDef.filter),
        });

        this.log.info(trace, "Initialized observable plugin {plugin}", { plugin: pluginKey });
      } catch (error: any) {
        this.log.error(trace, "Failed to load observable plugin {plugin}: {error}", {
          plugin: pluginKey,
          error: error.message,
        });
        throw error;
      }
    }

    this._ready = true;
    this.log.info(trace, "Observable plugins setup complete");
  }

  public async init(trace: DTrace, sbConfig: SBConfig) {
    this.log.info(trace, "Setting up observable plugins");
    await this.setupObservablePlugins(sbConfig);

    this.log.info(trace, "Initializing observable plugins");
    for (const observablePlugin of this.observablePlugins) {
      if (observablePlugin.plugin.init) {
        await (observablePlugin.plugin.init as any).call(observablePlugin.plugin);
      }
    }
    this.log.info(trace, "Observable plugins initialized");
  }

  public async run(trace: DTrace) {
    this.log.info(trace, "Running observable plugins");
    for (const observablePlugin of this.observablePlugins) {
      if (observablePlugin.plugin.run) {
        await (observablePlugin.plugin.run as any).call(observablePlugin.plugin);
      }
    }
    this.log.info(trace, "Observable plugins running");
  }

  public async dispose() {
    for (const observablePlugin of this.observablePlugins) {
      if (observablePlugin.plugin.dispose) {
        await SmartFunctionCallAsync(observablePlugin.plugin, observablePlugin.plugin.dispose);
      }
    }
    this.observablePlugins = [];
  }

  // Logging API (for PluginLogging to use)
  public debug(plugin: string, trace: DTrace, message: string, meta: LogMeta<any>) {
    this.observableBus.emit("debug", plugin, trace, message, meta);
  }

  public info(plugin: string, trace: DTrace, message: string, meta: LogMeta<any>) {
    this.observableBus.emit("info", plugin, trace, message, meta);
  }

  public warn(plugin: string, trace: DTrace, message: string, meta: LogMeta<any>) {
    this.observableBus.emit("warn", plugin, trace, message, meta);
  }

  public error(plugin: string, trace: DTrace, message: string | BSBError<any>, meta?: LogMeta<any>) {
    this.observableBus.emit("error", plugin, trace, message, meta);
  }

  // Metrics API (for PluginMetrics to use)
  public createCounter(timestamp: number, pluginName: string, name: string, description: string, help: string, labels?: string[]) {
    this.observableBus.emit("createCounter", timestamp, pluginName, name, description, help, labels);
  }

  public incrementCounter(timestamp: number, pluginName: string, name: string, value: number, labels?: Record<string, string>) {
    this.observableBus.emit("incrementCounter", timestamp, pluginName, name, value, labels);
  }

  public createGauge(timestamp: number, pluginName: string, name: string, description: string, help: string, labels?: string[]) {
    this.observableBus.emit("createGauge", timestamp, pluginName, name, description, help, labels);
  }

  public setGauge(timestamp: number, pluginName: string, name: string, value: number, labels?: Record<string, string>) {
    this.observableBus.emit("setGauge", timestamp, pluginName, name, value, labels);
  }

  public createHistogram(timestamp: number, pluginName: string, name: string, description: string, help: string, boundaries?: number[], labels?: string[]) {
    this.observableBus.emit("createHistogram", timestamp, pluginName, name, description, help, boundaries, labels);
  }

  public observeHistogram(timestamp: number, pluginName: string, name: string, value: number, labels?: Record<string, string>) {
    this.observableBus.emit("observeHistogram", timestamp, pluginName, name, value, labels);
  }

  public startSpan(timestamp: number, appId: string, pluginName: string, traceId: string, parentSpanId: string | null, spanId: string, name: string, attributes?: Record<string, string | number | boolean>) {
    this.observableBus.emit("spanStart", { t: traceId, s: spanId }, pluginName, name, attributes);
  }

  public endSpan(timestamp: number, appId: string, pluginName: string, traceId: string, spanId: string, attributes?: Record<string, string | number | boolean>) {
    this.observableBus.emit("spanEnd", { t: traceId, s: spanId }, pluginName, attributes);
  }

  public errorSpan(timestamp: number, appId: string, pluginName: string, traceId: string, spanId: string, error: Error, attributes?: Record<string, string | number | boolean>) {
    this.observableBus.emit("spanError", { t: traceId, s: spanId }, pluginName, error, attributes);
  }
}
