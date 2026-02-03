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
import { Tools } from './tools';
import {
  Counter,
  createFakeDTrace,
  DEBUG_MODE,
  DTrace,
  Gauge,
  Histogram,
  SmartLogMeta,
  Span,
  Timer,
  Trace
} from "../interfaces";
import { BSBError } from "./errorMessages";
import { MS_PER_NS, NS_PER_SEC } from "./base";

/**
 * Observable bus interface - unified for both logging and metrics
 * @hidden
 */
interface ObservableBus {
  readonly isReady: boolean;
  // Logging methods
  debug(plugin: string, trace: DTrace, message: string, ...meta: any[]): void;
  info(plugin: string, trace: DTrace, message: string, ...meta: any[]): void;
  warn(plugin: string, trace: DTrace, message: string, ...meta: any[]): void;
  error(plugin: string, trace: DTrace, message: string | BSBError<any>, ...meta: any[]): void;
  // Metrics methods
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
  return createFakeDTrace("base/ObservableBackend", span);
}

/**
 * Represents a single span in a distributed trace
 *
 * A span tracks a specific operation within a trace, with a unique span ID.
 * Spans form parent-child relationships to represent the call hierarchy.
 *
 * @internal
 * @hidden
 */
class ObservableBackendSpan implements Span {
  private _traceId: string;
  private _spanId: string;
  private pluginName: string;
  private backend: ObservableBus;
  private appId: string;

  /**
   * Create a new span
   * @param backend - Observable backend for emitting span events
   * @param appId - Application ID
   * @param pluginName - Name of the plugin creating the span
   * @param traceId - Trace ID (unique for the entire trace)
   * @param parentSpanId - Parent span ID (null for root spans)
   * @param spanId - This span's unique ID
   * @param name - Name of the span (e.g., "database-query")
   * @param attributes - Optional attributes to attach to the span
   */
  constructor(backend: ObservableBus, appId: string, pluginName: string, traceId: string, parentSpanId: string | null, spanId: string, name: string, attributes?: Record<string, string | number | boolean>) {
    this.backend = backend;
    this.appId = appId;
    this.pluginName = pluginName;
    this._traceId = traceId;
    this._spanId = spanId;
    this.backend.startSpan(Date.now(), this.appId, this.pluginName, traceId, parentSpanId, spanId, name, attributes);
  }

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
    this.backend.endSpan(Date.now(), this.appId, this.pluginName, this._traceId, this._spanId, attributes);
  }

  /**
   * Record an error on the span
   * @param error - Error or BSBError to record
   * @param attributes - Additional attributes to attach to the error
   */
  public error(error: BSBError<any> | Error, attributes?: Record<string, string | number | boolean>): void {
    this.backend.errorSpan(Date.now(), this.appId, this.pluginName, this._traceId, this._spanId, error, attributes);
  }
}

/**
 * Represents a complete trace with an associated span
 *
 * A trace represents the entire journey of a request through the system.
 * Each trace contains one or more spans representing individual operations.
 *
 * @internal
 * @hidden
 */
class ObservableBackendTrace implements Trace {
  private _traceId: string;
  private _span: Span;
  private backend: ObservableBus;
  private appId: string;
  private pluginName: string;

  /**
   * Create a new trace (overload for new trace without parent)
   * @param backend - Observable backend
   * @param appId - Application ID
   * @param pluginName - Plugin name
   * @param trace - null to create a new trace
   * @param opts - Options including span name and attributes
   */
  constructor(backend: ObservableBus, appId: string, pluginName: string, trace: null, opts: { name: string, attributes?: Record<string, string | number | boolean> })
  /**
   * Create a child trace from an existing trace
   * @param backend - Observable backend
   * @param appId - Application ID
   * @param pluginName - Plugin name
   * @param trace - Parent DTrace object
   * @param opts - Options including span name and attributes
   */
  constructor(backend: ObservableBus, appId: string, pluginName: string, trace: DTrace, opts: { name: string, attributes?: Record<string, string | number | boolean> });
  constructor(backend: ObservableBus, appId: string, pluginName: string, trace: DTrace | null, opts: { name: string, attributes?: Record<string, string | number | boolean> }) {
    this.backend = backend;
    this.appId = appId;
    this.pluginName = pluginName;
    this._traceId = trace?.t ?? uuidv7();
    const spanId = uuidv7();

    this._span = new ObservableBackendSpan(this.backend, this.appId, this.pluginName, this._traceId, trace?.s ?? null, spanId, opts!.name, opts?.attributes);
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

  /**
   * Get the DTrace object (trace ID + current span ID)
   * @returns DTrace object containing trace ID and current span ID
   */
  public get trace(): DTrace {
    return { t: this._traceId, s: this._span.id };
  }

  /**
   * End the trace by ending its associated span
   * @param attributes - Final attributes to attach before ending
   */
  public end(attributes?: Record<string, string | number | boolean>): void {
    this._span.end(attributes);
  }
}

/**
 * Observable Backend - Unified backend for logging and metrics
 *
 * This is the internal backend that handles both logging and metrics operations.
 * It replaces the separate PluginLogging and PluginMetrics classes with a single
 * unified implementation.
 *
 * @group Observable
 * @category Plugin Development Tools
 * @internal
 *
 * @example
 * ```typescript
 * // Internal use only - plugins use Observable interface
 * const backend = new ObservableBackend(
 *   'development',
 *   'my-app',
 *   'my-plugin',
 *   sbObservable
 * );
 * ```
 */
export class ObservableBackend {
  private bus: ObservableBus;
  private pluginName: string;
  private appId: string;
  private canDebug = false;

  /**
   * Create an ObservableBackend instance
   * @param mode - Debug mode setting
   * @param appId - Application ID
   * @param pluginName - Plugin name
   * @param bus - Observable bus for emitting events
   */
  constructor(mode: DEBUG_MODE, appId: string, pluginName: string, bus: ObservableBus) {
    this.bus = bus;
    this.pluginName = pluginName;
    this.appId = appId;
    if (mode !== "production") {
      this.canDebug = true;
    }
  }

  // ==================== LOGGING METHODS ====================

  /**
   * Logs a debug message
   *
   * @param trace - The trace to associate with the log
   * @param message - The message to log
   * @param meta - Additional information to log with the message
   * @returns nothing
   *
   * @example
   * ```ts
   * backend.debug(trace, "This is a debug log");
   * backend.debug(trace, "This is a debug {key}", {"key": "log"});
   * ```
   */
  public debug<T extends string>(trace: DTrace, message: T, ...meta: SmartLogMeta<T>): void {
    if (!this.canDebug) return; // Early return for performance
    this.bus.debug(this.pluginName, trace, message, ...meta);
  }

  /**
   * Logs an info message
   *
   * @param trace - The trace to associate with the log
   * @param message - The message to log
   * @param meta - Additional information to log with the message
   * @returns nothing
   *
   * @example
   * ```ts
   * backend.info(trace, "This is an info log");
   * backend.info(trace, "This is an info {key}", {"key": "log"});
   * ```
   */
  public info<T extends string>(trace: DTrace, message: T, ...meta: SmartLogMeta<T>): void {
    this.bus.info(this.pluginName, trace, message, ...meta);
  }

  /**
   * Logs a warn message
   *
   * @param trace - The trace to associate with the log
   * @param message - The message to log
   * @param meta - Additional information to log with the message
   * @returns nothing
   *
   * @example
   * ```ts
   * backend.warn(trace, "This is a warn log");
   * backend.warn(trace, "This is a warn {key}", {"key": "log"});
   * ```
   */
  public warn<T extends string>(trace: DTrace, message: T, ...meta: SmartLogMeta<T>): void {
    this.bus.warn(this.pluginName, trace, message, ...meta);
  }

  /**
   * Logs an error message
   *
   * @param trace - The trace to associate with the log
   * @param message - The message to log
   * @param meta - Additional information to log with the message
   * @returns nothing
   *
   * @example
   * ```ts
   * backend.error(trace, "This is an error log");
   * backend.error(trace, "This is an error {key}", {"key": "log"});
   * ```
   * ```ts
   * backend.error(new BSBError(trace, "error-key", "This is an error log"));
   * backend.error(new BSBError(trace, "error-key", "This is an error {key}", {"key": "log"}));
   * ```
   */
  public error<T extends string>(
    trace: DTrace,
    message: T,
    ...meta: SmartLogMeta<T>
  ): void;
  public error<T extends string>(error: BSBError<T>): void;
  public error<T extends DTrace | BSBError<string>, M extends string>(
    traceOrError: T,
    message?: M,
    ...meta: M extends string ? SmartLogMeta<M> : [undefined?]
  ): void {
    if (traceOrError instanceof BSBError) {
      if (traceOrError.raw !== null) {
        this.bus.error(
          this.pluginName,
          traceOrError.raw.trace,
          traceOrError.raw.message,
          traceOrError.raw.meta,
        );
        return;
      }
      this.error(createFakeDTrace('base/ObservableBackend', 'error'), traceOrError.message + ' - error ');
      return;
    }
    if (!Tools.isObject(traceOrError) || !Tools.isString(traceOrError.t) || !Tools.isString(traceOrError.s)) {
      this.error(createFakeDTrace('base/ObservableBackend', 'errorType'), JSON.stringify(traceOrError));
      return;
    }
    this.bus.error(
      this.pluginName,
      traceOrError,
      message!,
      ...meta,
    );
  }

  // ==================== METRICS METHODS ====================

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
   * const requests = backend.createCounter(
   *   "http_requests_total",
   *   "Total HTTP requests",
   *   "Count of all HTTP requests received",
   *   ["method", "status"]
   * );
   * requests.increment(1, { method: "GET", status: "200" });
   * ```
   */
  public createCounter<LABELS extends string | undefined>(name: string, description: string, help: string, labels?: LABELS[]): Counter<LABELS> {
    if (!this.bus.isReady) {
      throw new BSBError(internalTrace("createCounter"), "Metrics not ready!");
    }
    this.bus.createCounter(Date.now(), this.pluginName, name, description, help, labels as any);
    return {
      increment: (value: number = 1, labels?) => {
        this.bus.incrementCounter(Date.now(), this.pluginName, name, value, labels as any);
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
   * const activeConns = backend.createGauge(
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
    if (!this.bus.isReady) {
      throw new BSBError(internalTrace("createGauge"), "Metrics not ready!");
    }
    this.bus.createGauge(Date.now(), this.pluginName, name, description, help, labels as any);
    return {
      set: (value: number, labels?) => {
        this.bus.setGauge(Date.now(), this.pluginName, name, value, labels as any);
      },
      increment: (value: number = 1, labels?) => {
        // Note: Observable plugins should track current value and add internally
        this.bus.setGauge(Date.now(), this.pluginName, name, value, labels as any);
      },
      decrement: (value: number = 1, labels?) => {
        // Note: Observable plugins should track current value and subtract internally
        this.bus.setGauge(Date.now(), this.pluginName, name, -value, labels as any);
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
   * const duration = backend.createHistogram(
   *   "request_duration_ms",
   *   "Request duration",
   *   "Duration of HTTP requests in milliseconds",
   *   [10, 50, 100, 500, 1000, 5000],
   *   ["method"]
   * );
   * duration.record(125, { method: "GET" });
   * ```
   */
  public createHistogram<LABELS extends string | undefined>(name: string, description: string, help: string, boundaries?: number[], labels?: LABELS[]): Histogram<LABELS> {
    if (!this.bus.isReady) {
      throw new BSBError(internalTrace("createHistogram"), "Metrics not ready!");
    }
    this.bus.createHistogram(Date.now(), this.pluginName, name, description, help, boundaries, labels as any);
    return {
      record: (value: number, labels?) => {
        this.bus.observeHistogram(Date.now(), this.pluginName, name, value, labels as any);
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
   * const trace = backend.createTrace("process-batch", {
   *   "batch.size": 100
   * });
   * // ... do work ...
   * trace.end({ "batch.processed": 100 });
   * ```
   */
  public createTrace(name: string, attributes?: Record<string, string | number | boolean>): Trace {
    if (!this.bus.isReady) {
      throw new BSBError(internalTrace("createTrace"), "Metrics not ready!");
    }
    return new ObservableBackendTrace(this.bus, this.appId, this.pluginName, null, { name, attributes });
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
   * const childSpan = backend.createSpan(trace, "database-query");
   * // ... do work ...
   * childSpan.end();
   * ```
   */
  public createSpan(trace: DTrace, name: string, attributes?: Record<string, string | number | boolean>): Trace {
    if (!this.bus.isReady) {
      throw new BSBError(internalTrace("createSpan"), "Metrics not ready!");
    }
    return new ObservableBackendTrace(this.bus, this.appId, this.pluginName, trace, { name, attributes });
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
   * const timer = backend.createTimer();
   * await performOperation();
   * const elapsed = timer.stop();
   * ```
   */
  public createTimer(): Timer {
    if (!this.bus.isReady) {
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
