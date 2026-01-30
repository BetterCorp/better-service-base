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
import { BSBError } from "./errorMessages";
import { MS_PER_NS, NS_PER_SEC } from "./base";

/**
 * Observable bus interface for metrics
 * @hidden
 */
interface ObservableMetricsBus {
  readonly isReady: boolean;
  createCounter(timestamp: number, pluginName: string, name: string, description: string, help: string, labels?: string[]): void;
  incrementCounter(timestamp: number, pluginName: string, name: string, value: number, labels?: Record<string, string>): void;
  createGauge(timestamp: number, pluginName: string, name: string, description: string, help: string, labels?: string[]): void;
  setGauge(timestamp: number, pluginName: string, name: string, value: number, labels?: Record<string, string>): void;
  createHistogram(timestamp: number, pluginName: string, name: string, description: string, help: string, boundaries?: number[], labels?: string[]): void;
  observeHistogram(timestamp: number, pluginName: string, name: string, value: number, labels?: Record<string, string>): void;
  startSpan(timestamp: number, appId: string, pluginName: string, traceId: string, parentSpanId: string | null, spanId: string, name: string, attributes?: Record<string, string | number | boolean>): void;
  endSpan(timestamp: number, appId: string, pluginName: string, traceId: string, spanId: string, attributes?: Record<string, string | number | boolean>): void;
  errorSpan(timestamp: number, appId: string, pluginName: string, traceId: string, spanId: string, error: Error, attributes?: Record<string, string | number | boolean>): void;
}

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
  private metrics: ObservableMetricsBus;
  private appId: string;

  constructor(metrics: ObservableMetricsBus, appId: string, pluginName: string, traceId: string, parentSpanId: string | null, spanId: string, name: string, attributes?: Record<string, string | number | boolean>) {
    this.metrics = metrics;
    this.appId = appId;
    this.pluginName = pluginName;
    this._traceId = traceId;
    this._spanId = spanId;
    this.metrics.startSpan( Date.now(), this.appId, this.pluginName, traceId, parentSpanId, spanId, name, attributes);
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
    this.metrics.endSpan( Date.now(), this.appId, this.pluginName, this._traceId, this._spanId, attributes);
  }

  public error(error: BSBError<any> | Error, attributes?: Record<string, string | number | boolean>): void {
    this.metrics.errorSpan( Date.now(), this.appId, this.pluginName, this._traceId, this._spanId, error, attributes);
  }
}

export class PluginMetricsTrace implements Trace {
  private _traceId: string;
  private _span: Span;
  private metrics: ObservableMetricsBus;
  private appId: string;
  private pluginName: string;

  constructor(metrics: ObservableMetricsBus, appId: string, pluginName: string, trace: null, opts: { name: string, attributes?: Record<string, string | number | boolean> })
  constructor(metrics: ObservableMetricsBus, appId: string, pluginName: string, trace: DTrace, opts: { name: string, attributes?: Record<string, string | number | boolean> });
  constructor(metrics: ObservableMetricsBus, appId: string, pluginName: string, trace: DTrace | null, opts: { name: string, attributes?: Record<string, string | number | boolean> }) {
    this.metrics = metrics;
    this.appId = appId;
    this.pluginName = pluginName;
    this._traceId = trace?.t ?? uuidv7();
    const spanId = uuidv7();

    // Trace lifecycle events removed - handled by spans
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
    // Trace lifecycle events removed - handled by spans
  }
}

/**
 * @group Metrics
 * @category Plugin Development Tools
 * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/PluginMetrics.html | API: PluginMetrics}
 */
export class PluginMetrics implements IPluginMetrics {
  private metrics: ObservableMetricsBus;
  private pluginName: string;
  private appId: string;

  constructor(appId: string, plugin: string, metrics: ObservableMetricsBus) {
    this.metrics = metrics;
    this.pluginName = plugin;
    this.appId = appId;
  }

  public createCounter<LABELS extends string | undefined>(name: string, description: string, help: string, labels?: LABELS[]): Counter<LABELS> {
    if (!this.metrics.isReady) {
      throw new BSBError(internalTrace("createCounter"), "Metrics not ready!");
    }
    this.metrics.createCounter(Date.now(), this.pluginName, name, description, help, labels as any);
    return {
      increment: (value: number = 1, labels?) => {
        this.metrics.incrementCounter(Date.now(), this.pluginName, name, value, labels as any);
      },
    };
  }

  public createGauge<LABELS extends string | undefined>(name: string, description: string, help: string, labels?: LABELS[]): Gauge<LABELS> {
    if (!this.metrics.isReady) {
      throw new BSBError(internalTrace("createGauge"), "Metrics not ready!");
    }
    this.metrics.createGauge(Date.now(), this.pluginName, name, description, help, labels as any);
    return {
      set: (value: number, labels?) => {
        this.metrics.setGauge(Date.now(), this.pluginName, name, value, labels as any);
      },
      increment: (value: number = 1, labels?) => {
        // Note: Observable plugins should track current value and add internally
        this.metrics.setGauge(Date.now(), this.pluginName, name, value, labels as any);
      },
      decrement: (value: number = 1, labels?) => {
        // Note: Observable plugins should track current value and subtract internally
        this.metrics.setGauge(Date.now(), this.pluginName, name, -value, labels as any);
      },
    };
  }

  public createHistogram<LABELS extends string | undefined>(name: string, description: string, help: string, boundaries?: number[], labels?: LABELS[]): Histogram<LABELS> {
    if (!this.metrics.isReady) {
      throw new BSBError(internalTrace("createHistogram"), "Metrics not ready!");
    }
    this.metrics.createHistogram(Date.now(), this.pluginName, name, description, help, boundaries, labels as any);
    return {
      record: (value: number, labels?) => {
        this.metrics.observeHistogram(Date.now(), this.pluginName, name, value, labels as any);
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