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

/**
 * Represents a single span in a distributed trace
 *
 * A span tracks a specific operation within a trace, with a unique span ID.
 * Spans form parent-child relationships to represent the call hierarchy.
 *
 * @group Metrics
 * @category Plugin Development Tools
 * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/PluginMetricsSpan.html | API: PluginMetricsSpan}
 */
export class PluginMetricsSpan implements Span {
  private _traceId: string;
  private _spanId: string;
  private pluginName: string;
  private metrics: ObservableMetricsBus;
  private appId: string;

  /**
   * Create a new span
   * @param metrics - Observable metrics bus for emitting span events
   * @param appId - Application ID
   * @param pluginName - Name of the plugin creating the span
   * @param traceId - Trace ID (unique for the entire trace)
   * @param parentSpanId - Parent span ID (null for root spans)
   * @param spanId - This span's unique ID
   * @param name - Name of the span (e.g., "database-query")
   * @param attributes - Optional attributes to attach to the span
   */
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

  /**
   * Get the span ID
   * @returns The unique span ID
   */
  public get id(): string {
    return this._spanId;
  }

  /**
   * Get the DTrace object (trace ID + span ID)
   * @returns DTrace object containing trace ID and span ID
   */
  public get trace(): DTrace {
    return {
      t: this._traceId,
      s: this._spanId,
    };
  }

  /**
   * End the span
   * @param attributes - Final attributes to attach before ending
   */
  public end(attributes?: Record<string, string | number | boolean>): void {
    this.metrics.endSpan( Date.now(), this.appId, this.pluginName, this._traceId, this._spanId, attributes);
  }

  /**
   * Record an error on the span
   * @param error - Error or BSBError to record
   * @param attributes - Additional attributes to attach to the error
   */
  public error(error: BSBError<any> | Error, attributes?: Record<string, string | number | boolean>): void {
    this.metrics.errorSpan( Date.now(), this.appId, this.pluginName, this._traceId, this._spanId, error, attributes);
  }
}

/**
 * Represents a complete trace with an associated span
 *
 * A trace represents the entire journey of a request through the system.
 * Each trace contains one or more spans representing individual operations.
 *
 * @group Metrics
 * @category Plugin Development Tools
 * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/PluginMetricsTrace.html | API: PluginMetricsTrace}
 */
export class PluginMetricsTrace implements Trace {
  private _traceId: string;
  private _span: Span;
  private metrics: ObservableMetricsBus;
  private appId: string;
  private pluginName: string;

  /**
   * Create a new trace (overload for new trace without parent)
   * @param metrics - Observable metrics bus
   * @param appId - Application ID
   * @param pluginName - Plugin name
   * @param trace - null to create a new trace
   * @param opts - Options including span name and attributes
   */
  constructor(metrics: ObservableMetricsBus, appId: string, pluginName: string, trace: null, opts: { name: string, attributes?: Record<string, string | number | boolean> })
  /**
   * Create a child trace from an existing trace
   * @param metrics - Observable metrics bus
   * @param appId - Application ID
   * @param pluginName - Plugin name
   * @param trace - Parent DTrace object
   * @param opts - Options including span name and attributes
   */
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

  /**
   * Get the trace ID
   * @returns The unique trace ID
   */
  public get id(): string {
    return this._traceId;
  }

  /**
   * Record an error on the trace's span
   * @param error - Error or BSBError to record
   * @param attributes - Additional attributes to attach to the error
   */
  public error(error: BSBError<any> | Error, attributes?: Record<string, string | number | boolean>): void {
    this._span.error(error, attributes);
  }

  // public get span(): Span {
  //   return this._span;
  // }

  /**
   * Get the DTrace object (trace ID + current span ID)
   * @returns DTrace object containing trace ID and current span ID
   */
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

  /**
   * End the trace by ending its associated span
   * @param attributes - Final attributes to attach before ending
   */
  public end(attributes?: Record<string, string | number | boolean>): void {
    // End the parent span first
    this._span.end(attributes);
    // Trace lifecycle events removed - handled by spans
  }
}

/**
 * Plugin Metrics - Provides metric creation and tracing capabilities
 *
 * This class provides methods for creating counters, gauges, histograms, timers,
 * and distributed traces. It integrates with the Observable system to send metrics
 * to configured observability backends.
 *
 * @group Metrics
 * @category Plugin Development Tools
 * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/PluginMetrics.html | API: PluginMetrics}
 *
 * @example
 * ```typescript
 * // Available via Observable in plugins
 * public async run(obs: Observable) {
 *   // Create and use a counter
 *   const requestCounter = obs.metrics.counter(
 *     "requests_total",
 *     "Total requests",
 *     "Count of all incoming requests",
 *     ["method", "status"]
 *   );
 *   requestCounter.increment(1, { method: "GET", status: "200" });
 *
 *   // Create and use a timer
 *   const timer = obs.metrics.timer();
 *   await doWork();
 *   const elapsed = timer.stop();
 *   obs.log.info("Work completed in {ms}ms", { ms: elapsed });
 * }
 * ```
 */
export class PluginMetrics implements IPluginMetrics {
  private metrics: ObservableMetricsBus;
  private pluginName: string;
  private appId: string;

  /**
   * Create a PluginMetrics instance
   * @param appId - Application ID
   * @param plugin - Plugin name
   * @param metrics - Observable metrics bus
   */
  constructor(appId: string, plugin: string, metrics: ObservableMetricsBus) {
    this.metrics = metrics;
    this.pluginName = plugin;
    this.appId = appId;
  }

  /**
   * Create a counter metric
   *
   * Counters are monotonically increasing values used to track cumulative totals.
   * Common uses: request counts, error counts, bytes processed.
   *
   * @param name - Metric name (e.g., "requests_total")
   * @param description - Short description
   * @param help - Detailed help text
   * @param labels - Optional label names for dimensional metrics
   * @returns Counter instance with increment method
   *
   * @example
   * ```typescript
   * const requests = obs.metrics.counter(
   *   "http_requests_total",
   *   "Total HTTP requests",
   *   "Count of all HTTP requests received",
   *   ["method", "status"]
   * );
   * requests.increment(1, { method: "GET", status: "200" });
   * ```
   */
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

  /**
   * Create a gauge metric
   *
   * Gauges represent point-in-time values that can go up or down.
   * Common uses: memory usage, active connections, queue depth, temperature.
   *
   * @param name - Metric name (e.g., "active_connections")
   * @param description - Short description
   * @param help - Detailed help text
   * @param labels - Optional label names for dimensional metrics
   * @returns Gauge instance with set, increment, and decrement methods
   *
   * @example
   * ```typescript
   * const activeConns = obs.metrics.gauge(
   *   "active_connections",
   *   "Active connections",
   *   "Number of currently active connections"
   * );
   * activeConns.set(42);
   * activeConns.increment(1);
   * activeConns.decrement(1);
   * ```
   */
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

  /**
   * Create a histogram metric
   *
   * Histograms track the distribution of values over time.
   * Common uses: request duration, response size, batch size.
   *
   * @param name - Metric name (e.g., "request_duration_ms")
   * @param description - Short description
   * @param help - Detailed help text
   * @param boundaries - Optional bucket boundaries (default: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10])
   * @param labels - Optional label names for dimensional metrics
   * @returns Histogram instance with record method
   *
   * @example
   * ```typescript
   * const duration = obs.metrics.histogram(
   *   "request_duration_ms",
   *   "Request duration",
   *   "Duration of HTTP requests in milliseconds",
   *   [10, 50, 100, 500, 1000, 5000],
   *   ["method"]
   * );
   * const timer = obs.metrics.timer();
   * await handleRequest();
   * duration.record(timer.stop(), { method: "GET" });
   * ```
   */
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

  /**
   * Create a new distributed trace
   *
   * Creates a root trace with no parent. Use this when starting a new
   * request or operation that should be tracked independently.
   *
   * @param name - Name of the trace/span (e.g., "http-request")
   * @param attributes - Optional attributes to attach to the trace
   * @returns Trace instance
   *
   * @example
   * ```typescript
   * const trace = this.metrics.createTrace("process-batch", {
   *   "batch.size": 100
   * });
   * // ... do work ...
   * trace.end({ "batch.processed": 100 });
   * ```
   */
  public createTrace(name: string, attributes?: Record<string, string | number | boolean>): Trace {
    if (!this.metrics.isReady) {
      throw new BSBError(internalTrace("createTrace"), "Metrics not ready!");
    }
    return new PluginMetricsTrace(this.metrics, this.appId, this.pluginName, null, { name, attributes });
  }

  /**
   * Create a child span within an existing trace
   *
   * Creates a child span that inherits the trace ID from the parent.
   * This is used internally by Observable.span().
   *
   * @param trace - Parent DTrace object
   * @param name - Name of the span (e.g., "database-query")
   * @param attributes - Optional attributes to attach to the span
   * @returns Trace instance representing the child span
   *
   * @example
   * ```typescript
   * // Usually accessed via Observable
   * const childSpan = obs.span("database-query");
   * // ... do work ...
   * childSpan.end();
   * ```
   */
  public createSpan(trace: DTrace, name: string, attributes?: Record<string, string | number | boolean>): Trace {
    if (!this.metrics.isReady) {
      throw new BSBError(internalTrace("createSpan"), "Metrics not ready!");
    }
    return new PluginMetricsTrace(this.metrics, this.appId, this.pluginName, trace, { name, attributes });
  }

  /**
   * Create a high-resolution timer
   *
   * Returns a timer that can measure elapsed time in milliseconds with
   * sub-millisecond precision using Node.js hrtime.
   *
   * @returns Timer instance with stop method
   *
   * @example
   * ```typescript
   * const timer = obs.metrics.timer();
   * await performOperation();
   * const elapsed = timer.stop();
   * obs.log.info("Operation took {ms}ms", { ms: elapsed });
   * ```
   */
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