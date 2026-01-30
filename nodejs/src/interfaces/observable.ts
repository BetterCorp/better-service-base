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

import { DTrace } from './metrics';
import { SmartLogMeta } from './logging';
import { Counter, Gauge, Histogram, Timer } from './metrics';
import { ResourceContext } from '../base/ResourceContext';
import { z } from 'zod';

/**
 * Observable context for unified observability across logging, metrics, and tracing.
 *
 * Observable replaces DTrace in the public API and provides a unified interface for:
 * - Structured logging with automatic trace context
 * - Metrics creation with resource context
 * - Distributed tracing with W3C trace context
 * - Attribute propagation to child spans
 *
 * @group Observability
 * @category Core
 * @see {@link https://bsbcode.dev/languages/nodejs/types/interfaces/Observable.html | API: Observable}
 *
 * @example
 * ```typescript
 * // In a service plugin
 * public async run(obs: Observable) {
 *   // Logging
 *   obs.log.info("Starting service");
 *
 *   // Set attributes for all child operations
 *   const withUser = obs.setAttribute("user.id", "123");
 *
 *   // Create child span
 *   const childObs = withUser.span("database-query");
 *   childObs.log.debug("Querying database");
 *   // ... do work ...
 *   childObs.end();
 * }
 * ```
 */
export interface Observable<TAttributeSchema extends z.ZodSchema = z.ZodAny> {
  /**
   * Core trace information (W3C compatible)
   * @readonly
   */
  readonly trace: DTrace;

  /**
   * Trace ID (unique identifier for the entire trace)
   * @readonly
   */
  readonly traceId: string;

  /**
   * Span ID (unique identifier for this specific span)
   * @readonly
   */
  readonly spanId: string;

  /**
   * Resource context (service name, version, instance ID, environment, region)
   * Automatically populated from plugin configuration
   * @readonly
   */
  readonly resource: ResourceContext;

  /**
   * Custom attributes attached to this observable
   * Attributes are immutable - use setAttribute() to create new observable with additional attributes
   * @readonly
   */
  readonly attributes: Record<string, string | number | boolean>;

  /**
   * Logging methods with automatic trace context
   */
  log: {
    /**
     * Log a debug message
     * @param message - The message to log with optional {placeholder} syntax
     * @param meta - Metadata to replace placeholders and add to log
     */
    debug<T extends string>(message: T, ...meta: SmartLogMeta<T>): void;

    /**
     * Log an info message
     * @param message - The message to log with optional {placeholder} syntax
     * @param meta - Metadata to replace placeholders and add to log
     */
    info<T extends string>(message: T, ...meta: SmartLogMeta<T>): void;

    /**
     * Log a warning message
     * @param message - The message to log with optional {placeholder} syntax
     * @param meta - Metadata to replace placeholders and add to log
     */
    warn<T extends string>(message: T, ...meta: SmartLogMeta<T>): void;

    /**
     * Log an error message or BSBError
     * @param messageOrError - Either a message string or BSBError instance
     * @param meta - Metadata (only used if first arg is a message)
     */
    error<T extends string>(messageOrError: T | Error, ...meta: SmartLogMeta<T>): void;
  };

  /**
   * Metrics methods for creating counters, gauges, histograms, and timers
   */
  metrics: {
    /**
     * Create a counter metric
     * @param name - Metric name
     * @param description - Short description
     * @param help - Detailed help text
     * @param labels - Optional label names
     */
    counter<LABELS extends string | undefined>(
      name: string,
      description: string,
      help: string,
      labels?: LABELS[]
    ): Counter<LABELS>;

    /**
     * Create a gauge metric
     * @param name - Metric name
     * @param description - Short description
     * @param help - Detailed help text
     * @param labels - Optional label names
     */
    gauge<LABELS extends string | undefined>(
      name: string,
      description: string,
      help: string,
      labels?: LABELS[]
    ): Gauge<LABELS>;

    /**
     * Create a histogram metric
     * @param name - Metric name
     * @param description - Short description
     * @param help - Detailed help text
     * @param boundaries - Optional histogram boundaries
     * @param labels - Optional label names
     */
    histogram<LABELS extends string | undefined>(
      name: string,
      description: string,
      help: string,
      boundaries?: number[],
      labels?: LABELS[]
    ): Histogram<LABELS>;

    /**
     * Create a timer to measure elapsed time
     */
    timer(): Timer;
  };

  /**
   * Create a child span with inherited attributes
   * @param name - Name of the span
   * @param attributes - Additional attributes for this span
   * @returns New Observable representing the child span
   */
  span(name: string, attributes?: Record<string, string | number | boolean>): Observable<TAttributeSchema>;

  /**
   * Create a new Observable with an additional attribute
   * Observables are immutable - this returns a new instance
   * @param key - Attribute key
   * @param value - Attribute value
   * @returns New Observable with the added attribute
   */
  setAttribute<K extends string, V extends string | number | boolean>(
    key: K,
    value: V
  ): Observable<TAttributeSchema>;

  /**
   * Create a new Observable with multiple attributes
   * Observables are immutable - this returns a new instance
   * @param attrs - Attributes to add
   * @returns New Observable with the added attributes
   */
  setAttributes(attrs: Record<string, string | number | boolean>): Observable<TAttributeSchema>;

  /**
   * Record an error to both logs and traces
   * @param error - Error or BSBError to record
   * @param attributes - Additional attributes to attach
   */
  error(error: Error, attributes?: Record<string, string | number | boolean>): void;

  /**
   * End the span (only applies if this Observable was created via span())
   * @param attributes - Final attributes to attach before ending
   */
  end(attributes?: Record<string, string | number | boolean>): void;
}
