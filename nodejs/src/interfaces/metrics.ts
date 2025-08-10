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

import { BSBError } from "../base";

/**
 * @group Metrics
 * @category Plugin Development Tools
 * @see {@link https://bsbcode.dev/languages/nodejs/types/interfaces/IPluginMetrics.html | API: IPluginMetrics}
 */
export interface IPluginMetrics {
  /**
   * Creates a counter metric.
   * A Counter is a metric that represents a monotonically increasing value.
   * It is used to measure the cumulative count of an event that increases
   * over time and resets to zero only when the process restarts.
   *
   * @remarks
   * Use Cases:
   *
   * Event Counting: Counting the number of requests received, errors encountered, or messages processed.
   * Work Done: Measuring the total number of bytes read or written, tasks completed, or jobs processed.
   * Characteristics:
   *
   * Monotonic: Counters can only increase or reset. They cannot decrease.
   * Sum: The focus is on the total accumulated value over time.
   * Example: A Counter can be used to count the number of HTTP requests received by a server.
   *
   * @param name - The name of the counter metric
   * @param description - A description of the counter metric
   * @param help - More information about the counter metric
   * @param labels - Optional labels to associate with the counter metric
   * @returns A Counter object that can be used to update the counter metric
   *
   * @example
   * ```ts
   * let counter = this.metrics.createCounter("my-counter", "A counter metric");
   * counter.inc(); // Increment the counter by 1
   * counter.inc(1); // Increment the counter by 1
   * counter.inc(10); // Increment the counter by 10
   * ```
   * @see {@link https://bsbcode.dev/languages/nodejs/types/interfaces/IPluginMetrics.html#createCounter | API: IPluginMetrics#createCounter}
   */
  createCounter<LABELS extends string | undefined>(name: string, description: string, help: string, labels?: LABELS[]): Counter<LABELS>;

  /**
   * Creates a gauge metric.
   * A  Gauge is a metric that represents a value that can go up and down.
   * It measures the current value of a particular data point at a specific moment in time.
   *
   * @remarks
   * Use Cases:
   *
   * Resource Levels: Monitoring CPU usage, memory consumption, or disk space.
   * Temperature or Pressure: Tracking real-time sensor readings.
   * Current State: Measuring the current number of active users or open connections.
   * Characteristics:
   *
   * Variable: Gauges can increase and decrease over time.
   * Instantaneous: Captures a snapshot of a value at a particular time.
   * Example: A Gauge can be used to measure the current temperature of a system or the current memory usage of an application.
   *
   * @param name - The name of the gauge metric
   * @param description - A description of the gauge metric
   * @param help - More information about the gauge metric
   * @param labels - Optional labels to associate with the gauge metric
   * @returns A Gauge object that can be used to update the gauge metric
   *
   * @example
   * ```ts
   * let gauge = this.metrics.createGauge("my-gauge", "A gauge metric");
   * gauge.set(10); // Set the gauge to 10
   * gauge.set(20); // Set the gauge to 20
   * gauge.set(30); // Set the gauge to 30  
   * gauge.increment(); // Increment the gauge by 1
   * gauge.increment(10); // Increment the gauge by 10
   * gauge.decrement(); // Decrement the gauge by 1
   * gauge.decrement(10); // Decrement the gauge by 10
   * ```
   * @see {@link https://bsbcode.dev/languages/nodejs/types/interfaces/IPluginMetrics.html#createGauge | API: IPluginMetrics#createGauge}
   */
  createGauge<LABELS extends string | undefined>(name: string, description: string, help: string, labels?: LABELS[]): Gauge<LABELS>;

  /**
   * Creates a histogram metric.
   * A Histogram is a metric that collects data samples and counts them in predefined buckets.
   * It provides statistical distribution of values over time, capturing not just the
   * total sum but also the distribution of values.
   *
   * @remarks
   * Use Cases:
   *
   * Event Distribution: Measuring the distribution of events received by a system, such as the number of requests per second or the distribution of response times.
   * Work Done: Measuring the distribution of bytes read or written, tasks completed, or jobs processed.
   * Characteristics:
   *
   * Monotonic: Histograms can only increase or reset. They cannot decrease.
   * Sum: The focus is on the total accumulated value over time.
   * Example: A Histogram can be used to measure the distribution of response times for a web server.
   *
   * @param name - The name of the histogram metric
   * @param description - A description of the histogram metric
   * @param help - More information about the histogram metric
   * @param boundaries - Optional boundaries for the histogram metric
   * @param labels - Optional labels to associate with the histogram metric
   * @returns A Histogram object that can be used to update the histogram metric
   *
   * @example
   * ```ts
   * let histogram = this.metrics.createHistogram("my-histogram", "A histogram metric");
   * histogram.record(10); // Record the value 10 in the histogram
   * histogram.record(20); // Record the value 20 in the histogram
   * histogram.record(30); // Record the value 30 in the histogram
   * ```
   * @see {@link https://bsbcode.dev/languages/nodejs/types/interfaces/IPluginMetrics.html#createHistogram | API: IPluginMetrics#createHistogram}
   */
  createHistogram<LABELS extends string | undefined>(name: string, description: string, help: string, boundaries?: number[], labels?: LABELS[]): Histogram<LABELS>;

  /**
   * Creates a trace metric.
   * A Trace is a metric that represents a sequence of events or operations that form a request or transaction.
   * It provides a way to track and monitor the flow of operations across your application.
   *
   * @remarks
   * Use Cases:
   * - Request Tracing: Following a request as it moves through different services or components
   * - Performance Monitoring: Tracking the timing and dependencies of operations
   * - Error Tracking: Identifying where in a sequence of operations an error occurred
   * - Distributed Tracing: Monitoring operations across multiple services
   *
   * Characteristics:
   * - Unique Identification: Each trace has a unique ID
   * - Attributes: Can include key-value pairs for additional context
   * - Error Handling: Built-in support for error recording
   * - Lifecycle Management: Clear start and end points
   *
   * @param name - The name of the trace, used to identify the operation or request being traced
   * @param attributes - Optional key-value pairs providing additional context about the trace
   * @returns A Trace object that can be used to record spans, errors, and manage the trace lifecycle
   *
   * @example
   * ```ts
   * // Create a simple trace
   * const trace = this.metrics.createTrace("user-registration");
   * 
   * // OR Create a trace with attributes
   * const trace = this.metrics.createTrace("payment-processing", {
   *   "customer-id": "12345",
   *   "payment-method": "credit-card"
   * });
   * 
   * // Using the trace
   * try {
   *   // Perform operations
   *   const span = this.metrics.createSpan(trace, "get-customer-balance");
   *   // Do some external work
   *   span.end({balance: 100});
   *   trace.end({transactionId: "12345"});
   * } catch (error) {
   *   trace.error(error);
   * }
   * trace.end();
   * ```
   * @see {@link https://bsbcode.dev/languages/nodejs/types/interfaces/IPluginMetrics.html#createTrace | API: IPluginMetrics#createTrace}
   */
  createTrace(name: string, attributes?: Record<string, string | number | boolean>): Trace;

  /**
   * Creates a new span from an existing trace (automatic parent span).
   * @param trace - The trace to associate with the span
   * @param name - The name of the span
   * @param attributes - Optional attributes to associate with the span
   * @returns A Span object that can be used to update the span metric
   * 
   * @example
   * ```ts
   * let span = this.metrics.createSpan(trace, "span-1", {"key": "value"});
   * span.end();
   * ```
   * @see {@link https://bsbcode.dev/languages/nodejs/types/interfaces/IPluginMetrics.html#createSpan | API: IPluginMetrics#createSpan}
   */
  createSpan(trace: DTrace, name: string, attributes?: Record<string, string | number | boolean>): Trace

  /***
   * Create Timer
   * A Timer is a metric that measures the time taken to execute a block of code.
   * It provides a simple way to measure the time taken to execute a block of code.
   *
   * @remarks
   * Use Cases:
   *
   * Event Timing: Measuring the time taken to execute a block of code.
   * Work Done: Measuring the time taken to execute a block of code.
   * Characteristics:
   *
   * Monotonic: Timers can only increase or reset. They cannot decrease.
   * Sum: The focus is on the total accumulated value over time.
   * Example: A Timer can be used to measure the time taken to execute a block of code.
   *
   * @returns A Timer object that can be used to update the timer metric
   *
   * @example
   * ```ts
   * let timer = this.metrics.createTimer(); // Start the timer
   * // Do some work
   * let elapsedTime = timer.stop(); // Stop the timer and get the elapsed time in nanoseconds
   * ```
   * @see {@link https://bsbcode.dev/languages/nodejs/types/interfaces/IPluginMetrics.html#createTimer | API: IPluginMetrics#createTimer}
   */
  createTimer(): Timer
}

export interface Timer {
  /**
   * Stops the timer
   * @return The elapsed time in milliseconds
   */
  stop(): number
}

export interface Trace {
  /**
   * This trace ID.
   */
  id: Readonly<string>;

  /**
   * This trace.
   */
  trace: Readonly<DTrace>;

  /**
   * Starts a new span with the specified name.
   *
   * @param name - The name of the span
   * @param attributes - Optional attributes to associate with the span
   */
  //createSpan(name: string, attributes?: Record<string, string|number|boolean>): Span;

  /**
   * Starts a new span linked to a parent span.
   *
   * @param parentSpanId - Optional parent span ID
   * @param name - The name of the span
   * @param attributes - Optional attributes to associate with the span
   */
  //createSpanFromParent(parentSpanId: string, name: string, attributes?: Record<string, string|number|boolean>): Span;

  /**
   * Records an error in the current span.
   *
   * @param error - The error to record
   * @param attributes - Optional attributes to associate with the span
   */
  error(error: BSBError<any> | Error, attributes?: Record<string, string | number | boolean>): void;

  /**
   * Ends the current trace or span.
   * If the trace was created, then it will end both. However if it references an existing trace, then it will only end the span.
   *
   * @param attributes - Optional attributes to associate with the trace
   */
  end(attributes?: Record<string, string | number | boolean>): void;
}

/**
 * @hidden
 */
const traceCache = new Map<string, DTrace>();
export const createFakeDTrace = (trace: string, span: string): DTrace => {
  const cacheKey = `${trace}:${span}`;
  let cached = traceCache.get(cacheKey);
  if (!cached) {
    cached = { t: `INTERNAL:${trace}`, s: span };
    if (traceCache.size < 1000) { // Prevent memory leaks
      traceCache.set(cacheKey, cached);
    }
  }
  return cached;
};
/**
 * @hidden
 */

export interface DTrace {
  /**
   * This trace ID.
   */
  t: Readonly<string>;
  /**
   * This span ID.
   */
  s: Readonly<string>;
}

export interface Span {
  /**
   * This span ID.
   */
  id: Readonly<string>;
  /**
   * This trace ID.
   */
  //traceId: Readonly<string>;
  /**
   * This dTrace reference.
   */
  trace: Readonly<DTrace>;

  /**
   * Ends the current span.
   *
   * @param attributes - Optional attributes to associate with the span
   */
  end(attributes?: Record<string, string | number | boolean>): void;

  /**
   * Records an error in the current span.
   *
   * @param error - The error to record
   * @param attributes - Optional labels to associate with the span
   */
  error(error: BSBError<any> | Error, attributes?: Record<string, string | number | boolean>): void;
}

export interface Counter<LABELS extends string | undefined = undefined> {
  /**
   * Adds a value to the counter metric.
   *
   * @param value - The value to add to the counter metric
   * @param labels - Optional labels to associate with the counter metric
   */
  increment(value?: number, labels?: LABELS extends string ? Partial<Record<LABELS, string>> : never): void;
}

export interface Gauge<LABELS extends string | undefined = undefined> {
  /**
   * Sets the value of the gauge metric.
   *
   * @param value - The value to set the gauge metric
   * @param labels - Optional labels to associate with the gauge metric
   */
  set(value: number, labels?: LABELS extends string ? Partial<Record<LABELS, string>> : never): void;

  /**
   * Increments the value of the gauge metric by a specified amount.
   *
   * @param value - The amount to increment the gauge metric by
   * @param labels - Optional labels to associate with the gauge metric
   */
  increment(value?: number, labels?: LABELS extends string ? Partial<Record<LABELS, string>> : never): void;

  /**
   * Decrements the value of the gauge metric by a specified amount.
   *
   * @param value - The amount to decrement the gauge metric by
   * @param labels - Optional labels to associate with the gauge metric
   */
  decrement(value?: number, labels?: LABELS extends string ? Partial<Record<LABELS, string>> : never): void;
}

export interface Histogram<LABELS extends string | undefined = undefined> {
  /**
   * Records a value in the histogram metric.
   *
   * @param value - The value to record in the histogram metric
   * @param labels - Optional labels to associate with the histogram metric
   */
  record(value: number, labels?: LABELS extends string ? Partial<Record<LABELS, string>> : never): void;
}

