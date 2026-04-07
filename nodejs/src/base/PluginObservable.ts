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

import { Observable } from '../interfaces/observable.js';
import { DTrace, Trace, IPluginObservable } from '../interfaces/metrics.js';
import { ResourceContext } from './ResourceContext.js';
import { BSBError } from './errorMessages.js';
import { SmartLogMeta } from '../interfaces/logging.js';

/**
 * Implementation of Observable interface that wraps DTrace with observability features
 *
 * @group Observability
 * @category Plugin Development Tools
 * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/PluginObservable.html | API: PluginObservable}
 */
export class PluginObservable implements Observable {

  private readonly _trace: DTrace;
  private readonly _resource: ResourceContext;
  private readonly _attributes: Record<string, string | number | boolean>;
  private readonly _backend: IPluginObservable;
  private readonly _span?: Trace;

  /**
   * Create a PluginObservable
   * @param trace - DTrace object
   * @param resource - Resource context
   * @param backend - IPluginObservable instance (unified logging and metrics backend)
   * @param attributes - Initial attributes
   * @param span - Optional Trace/Span object (if created via startSpan())
   */
  constructor(
    trace: DTrace,
    resource: ResourceContext,
    backend: IPluginObservable,
    attributes: Record<string, string | number | boolean> = {},
    span?: Trace
  ) {
    this._trace = trace;
    this._resource = resource;
    this._backend = backend;
    this._attributes = attributes;
    this._span = span;
  }

  get trace(): DTrace {
    return this._trace;
  }

  get traceId(): string {
    return this._trace.t;
  }

  get spanId(): string {
    return this._trace.s;
  }

  get resource(): ResourceContext {
    return this._resource;
  }

  get attributes(): Record<string, string | number | boolean> {
    return { ...this._attributes };
  }

  // Delegate logging to unified backend
  log = {
    debug: <T extends string>(message: T, ...meta: SmartLogMeta<T>) =>
      this._backend.debug(this._trace, message, ...meta),

    info: <T extends string>(message: T, ...meta: SmartLogMeta<T>) =>
      this._backend.info(this._trace, message, ...meta),

    warn: <T extends string>(message: T, ...meta: SmartLogMeta<T>) =>
      this._backend.warn(this._trace, message, ...meta),

    error: <T extends string>(messageOrError: T | Error, ...meta: SmartLogMeta<T>) => {
      if (messageOrError instanceof BSBError) {
        this._backend.error(messageOrError);
      } else if (messageOrError instanceof Error) {
        (this._backend.error as any)(this._trace, messageOrError.message);
      } else {
        this._backend.error(this._trace, messageOrError, ...meta);
      }
    }
  };

  // Delegate metrics to unified backend
  metrics = {
    counter: <LABELS extends string | undefined>(
      name: string,
      description: string,
      help: string,
      labels?: LABELS[]
    ) => this._backend.createCounter(name, description, help, labels),

    gauge: <LABELS extends string | undefined>(
      name: string,
      description: string,
      help: string,
      labels?: LABELS[]
    ) => this._backend.createGauge(name, description, help, labels),

    histogram: <LABELS extends string | undefined>(
      name: string,
      description: string,
      help: string,
      boundaries?: number[],
      labels?: LABELS[]
    ) => this._backend.createHistogram(name, description, help, boundaries, labels),

    timer: () => this._backend.createTimer()
  };

  /**
   * Create a child span with inherited attributes
   *
   * Creates a new Observable representing a child span for distributed tracing.
   * All attributes from the parent are automatically inherited by the child.
   *
   * @param name - Name of the span (e.g., "database-query", "api-call")
   * @param attributes - Additional attributes to add to this span
   * @returns New Observable instance representing the child span
   *
   * @example
   * ```typescript
   * public async processOrder(obs: Observable) {
   *   // Create child span for database operation
   *   const dbSpan = obs.startSpan("fetch-order", { "order.id": "123" });
   *   try {
   *     const order = await this.db.getOrder("123");
   *     dbSpan.end({ "order.status": order.status });
   *   } catch (error) {
   *     dbSpan.error(error);
   *     dbSpan.end();
   *   }
   * }
   * ```
   */
  startSpan(
    name: string,
    attributes?: Record<string, string | number | boolean>
  ): Observable {
    const mergedAttributes = { ...this._attributes, ...attributes };
    const childSpan = this._backend.createSpan(this._trace, name, mergedAttributes);

    return new PluginObservable(
      childSpan.trace,
      this._resource,
      this._backend,
      mergedAttributes,
      childSpan
    );
  }

  /**
   * Create a new Observable with an additional attribute
   *
   * Observables are immutable - this returns a new instance with the added attribute.
   * The attribute is propagated to all child operations (logs, spans, etc.).
   *
   * @param key - Attribute key (e.g., "user.id", "transaction.type")
   * @param value - Attribute value (string, number, or boolean)
   * @returns New Observable instance with the added attribute
   *
   * @example
   * ```typescript
   * public async handleRequest(obs: Observable, userId: string) {
   *   // Add user ID to all subsequent operations
   *   const withUser = obs.setAttribute("user.id", userId);
   *
   *   withUser.log.info("Processing request");  // Log includes user.id
   *   const span = withUser.startSpan("process");    // Span includes user.id
   * }
   * ```
   */
  setAttribute<K extends string, V extends string | number | boolean>(
    key: K,
    value: V
  ): Observable {
    return new PluginObservable(
      this._trace,
      this._resource,
      this._backend,
      { ...this._attributes, [key]: value },
      this._span
    );
  }

  /**
   * Create a new Observable with multiple attributes
   *
   * Observables are immutable - this returns a new instance with the added attributes.
   * All attributes are propagated to child operations.
   *
   * @param attrs - Object containing attributes to add
   * @returns New Observable instance with the added attributes
   *
   * @example
   * ```typescript
   * public async handleRequest(obs: Observable, context: RequestContext) {
   *   // Add multiple attributes at once
   *   const withContext = obs.setAttributes({
   *     "user.id": context.userId,
   *     "request.id": context.requestId,
   *     "request.method": context.method
   *   });
   *
   *   withContext.log.info("Processing request");
   * }
   * ```
   */
  setAttributes(
    attrs: Record<string, string | number | boolean>
  ): Observable {
    return new PluginObservable(
      this._trace,
      this._resource,
      this._backend,
      { ...this._attributes, ...attrs },
      this._span
    );
  }

  /**
   * Record an error to both logs and traces
   *
   * This method automatically records the error to both the logging system and
   * the active span (if this Observable was created via startSpan()). This ensures
   * errors are captured in both systems for complete observability.
   *
   * @param error - Error or BSBError instance to record
   * @param attributes - Additional attributes to attach to the error
   *
   * @example
   * ```typescript
   * public async processData(obs: Observable) {
   *   const span = obs.startSpan("process-data");
   *   try {
   *     await this.riskyOperation();
   *   } catch (error) {
   *     // Record error to both logs and span
   *     span.error(error as Error, { "operation": "riskyOperation" });
   *     span.end();
   *     throw error;
   *   }
   * }
   * ```
   */
  error(
    error: Error | BSBError<any>,
    attributes?: Record<string, string | number | boolean>
  ): void {
    const mergedAttrs = { ...this._attributes, ...attributes };

    // Record to span
    if (this._span) {
      this._span.error(error, mergedAttrs);
    }

    // Record to logs
    if (error instanceof BSBError) {
      this._backend.error(error);
    } else {
      this._backend.error(this._trace, error.message);
    }
  }

  /**
   * End the span (only applies if this Observable was created via startSpan())
   *
   * Completes the span and records the final state. If this Observable was not
   * created via startSpan(), this method does nothing. Always call end() when the
   * operation is complete to ensure proper trace completion.
   *
   * @param attributes - Final attributes to attach before ending the span
   *
   * @example
   * ```typescript
   * public async fetchData(obs: Observable) {
   *   const span = obs.startSpan("fetch-data");
   *   try {
   *     const data = await this.api.fetch();
   *     span.end({ "data.size": data.length, "status": "success" });
   *     return data;
   *   } catch (error) {
   *     span.error(error as Error);
   *     span.end({ "status": "failed" });
   *     throw error;
   *   }
   * }
   * ```
   */
  end(attributes?: Record<string, string | number | boolean>): void {
    if (this._span) {
      const mergedAttrs = { ...this._attributes, ...attributes };
      this._span.end(mergedAttrs);
    }
  }
}
