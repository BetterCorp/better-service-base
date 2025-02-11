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

import { v7 as uuidv7 } from "uuid";
import {
  Counter,
  createFakeDTrace,
  DTrace,
  Gauge,
  Histogram,
  IPluginMetrics,
  Span,
  Timer,
  Trace
} from "../interfaces";
import { SBMetrics } from "../serviceBase";
import { BSBError } from "./errorMessages";
import { MS_PER_NS, NS_PER_SEC } from "./base";

/**
 * @hidden
 */
function internalTrace(span: string): DTrace {
  return createFakeDTrace("base/PluginMetrics", span);
}

export class PluginMetricsSpan implements Span {
  private _traceId: string;
  private _spanId: string;
  private pluginName: string;
  private metrics: SBMetrics;
  private appId: string;

  constructor(metrics: SBMetrics, appId: string, pluginName: string, traceId: string, parentSpanId: string | null, spanId: string, name: string, attributes?: Record<string, string | number | boolean>) {
    this.metrics = metrics;
    this.appId = appId;
    this.pluginName = pluginName;
    this._traceId = traceId;
    this._spanId = spanId;
    this.metrics.metricsBus.emit("startSpan", Date.now(), this.appId, this.pluginName, traceId, parentSpanId, spanId, name, attributes);
  }

  // public get traceId(): string {
  //   return this._traceId;
  // }

  public get id(): string {
    return this._spanId;
  }

  public get trace(): DTrace {
    return {
      t: this._traceId,
      s: this._spanId,
    };
  }

  public end(attributes?: Record<string, string | number | boolean>): void {
    this.metrics.metricsBus.emit("endSpan", Date.now(), this.appId, this.pluginName, this._traceId, this._spanId, attributes);
  }

  public error(error: BSBError<any> | Error, attributes?: Record<string, string | number | boolean>): void {
    this.metrics.metricsBus.emit("errorSpan", Date.now(), this.appId, this.pluginName, this._traceId, this._spanId, error, attributes);
  }
}

export class PluginMetricsTrace implements Trace {
  private _traceId: string;
  private _createdTrace: boolean = false;
  private _span: Span;
  private metrics: SBMetrics;
  private appId: string;
  private pluginName: string;

  constructor(metrics: SBMetrics, appId: string, pluginName: string, trace: null, opts: { name: string, attributes?: Record<string, string | number | boolean> })
  constructor(metrics: SBMetrics, appId: string, pluginName: string, trace: DTrace, opts: { name: string, attributes?: Record<string, string | number | boolean> });
  constructor(metrics: SBMetrics, appId: string, pluginName: string, trace: DTrace | null, opts: { name: string, attributes?: Record<string, string | number | boolean> }) {
    this.metrics = metrics;
    this.appId = appId;
    this.pluginName = pluginName;
    this._traceId = trace?.t ?? uuidv7();
    const spanId = uuidv7();

    if (trace === null) {
      this._createdTrace = true;
      // Start a new trace
      this.metrics.metricsBus.emit("startTrace", Date.now(), this.appId, this.pluginName, this._traceId, opts?.name, opts?.attributes);
    }
    this._span = new PluginMetricsSpan(this.metrics, this.appId, this.pluginName, this._traceId, trace?.s ?? null, spanId, opts!.name, opts?.attributes);
  }

  public get id(): string {
    return this._traceId;
  }

  public error(error: BSBError<any> | Error, attributes?: Record<string, string | number | boolean>): void {
    this._span.error(error, attributes);
  }

  // public get span(): Span {
  //   return this._span;
  // }

  public get trace(): DTrace {
    return { t: this._traceId, s: this._span.id };
  }

  // public createSpan(name: string, attributes?: Record<string, string | number | boolean>): Span {
  //   const spanId = uuidv7();
  //   return new PluginMetricsSpan(this.metrics, this.appId, this.pluginName, this._traceId, spanId, name, this._parentSpan.id, attributes);
  // }

  // public createSpanFromParent(parentSpanId: string, name: string, attributes?: Record<string, string | number | boolean>): Span {
  //   const spanId = uuidv7();
  //   return new PluginMetricsSpan(this.metrics, this.appId, this.pluginName, this._traceId, spanId, name, parentSpanId, attributes);
  // }

  public end(attributes?: Record<string, string | number | boolean>): void {
    // End the parent span first
    this._span.end(attributes);
    if (this._createdTrace) {
      // Then end the trace
      this.metrics.metricsBus.emit("endTrace", Date.now(), this.appId, this.pluginName, this._traceId, attributes);
    }
  }
}

export class PluginMetrics implements IPluginMetrics {
  private metrics: SBMetrics;
  private pluginName: string;
  private appId: string;

  constructor(appId: string, plugin: string, metrics: SBMetrics) {
    this.metrics = metrics;
    this.pluginName = plugin;
    this.appId = appId;
  }

  public createCounter<LABELS extends string | undefined>(name: string, description: string, help: string, labels?: LABELS[]): Counter<LABELS> {
    if (!this.metrics.isReady) {
      throw new BSBError(internalTrace("createCounter"), "Metrics not ready!");
    }
    this.metrics.metricsBus.emit("createCounter", Date.now(), this.appId, this.pluginName, name, description, help, labels);
    return {
      increment: (value: number = 1, labels?) => {
        this.metrics.metricsBus.emit("updateCounter", Date.now(), "inc", this.appId, this.pluginName, name, value, labels);
      },
    };
  }

  public createGauge<LABELS extends string | undefined>(name: string, description: string, help: string, labels?: LABELS[]): Gauge<LABELS> {
    if (!this.metrics.isReady) {
      throw new BSBError(internalTrace("createGauge"), "Metrics not ready!");
    }
    this.metrics.metricsBus.emit("createGauge", Date.now(), this.appId, this.pluginName, name, description, help, labels);
    return {
      set: (value: number, labels?) => {
        this.metrics.metricsBus.emit("updateGauge", Date.now(), "set", this.appId, this.pluginName, name, value, labels);
      },
      increment: (value: number = 1, labels?) => {
        this.metrics.metricsBus.emit("updateGauge", Date.now(), "inc", this.appId, this.pluginName, name, value, labels);
      },
      decrement: (value: number = 1, labels?) => {
        this.metrics.metricsBus.emit("updateGauge", Date.now(), "dec", this.appId, this.pluginName, name, value, labels);
      },
    };
  }

  public createHistogram<LABELS extends string | undefined>(name: string, description: string, help: string, boundaries?: number[], labels?: LABELS[]): Histogram<LABELS> {
    if (!this.metrics.isReady) {
      throw new BSBError(internalTrace("createHistogram"), "Metrics not ready!");
    }
    this.metrics.metricsBus.emit("createHistogram", Date.now(), this.appId, this.pluginName, name, description, help, boundaries, labels);
    return {
      record: (value: number, labels?) => {
        this.metrics.metricsBus.emit("updateHistogram", Date.now(), "record", this.appId, this.pluginName, name, value, labels);
      },
    };
  }

  public createTrace(name: string, attributes?: Record<string, string | number | boolean>): Trace {
    if (!this.metrics.isReady) {
      throw new BSBError(internalTrace("createTrace"), "Metrics not ready!");
    }
    return new PluginMetricsTrace(this.metrics, this.appId, this.pluginName, null, { name, attributes });
  }

  public createSpan(trace: DTrace, name: string, attributes?: Record<string, string | number | boolean>): Trace {
    if (!this.metrics.isReady) {
      throw new BSBError(internalTrace("createSpan"), "Metrics not ready!");
    }
    return new PluginMetricsTrace(this.metrics, this.appId, this.pluginName, trace, { name, attributes });
  }

  public createTimer(): Timer {
    if (!this.metrics.isReady) {
      throw new BSBError(internalTrace("createTimer"), "Metrics not ready!");
    }
    const start = process.hrtime();
    return {
      stop: () => {
        const diff = process.hrtime(start);
        return (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS;
      }
    };
  }
}