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

import { Observable } from '../interfaces/observable';
import { DTrace, Trace } from '../interfaces/metrics';
import { ResourceContext } from './ResourceContext';
import { PluginLogging } from './PluginLogging';
import { PluginMetrics } from './PluginMetrics';
import { BSBError } from './errorMessages';
import { SmartLogMeta } from '../interfaces/logging';
import { z } from 'zod';

/**
 * Implementation of Observable interface that wraps DTrace with observability features
 *
 * @group Observability
 * @category Plugin Development Tools
 * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/PluginObservable.html | API: PluginObservable}
 */
export class PluginObservable<TAttributeSchema extends z.ZodSchema = z.ZodAny>
  implements Observable<TAttributeSchema> {

  private readonly _trace: DTrace;
  private readonly _resource: ResourceContext;
  private readonly _attributes: Record<string, string | number | boolean>;
  private readonly _logging: PluginLogging;
  private readonly _metrics: PluginMetrics;
  private readonly _span?: Trace;

  /**
   * Create a PluginObservable
   * @param trace - DTrace object
   * @param resource - Resource context
   * @param logging - PluginLogging instance
   * @param metrics - PluginMetrics instance
   * @param attributes - Initial attributes
   * @param span - Optional Trace/Span object (if created via span())
   */
  constructor(
    trace: DTrace,
    resource: ResourceContext,
    logging: PluginLogging,
    metrics: PluginMetrics,
    attributes: Record<string, string | number | boolean> = {},
    span?: Trace
  ) {
    this._trace = trace;
    this._resource = resource;
    this._logging = logging;
    this._metrics = metrics;
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

  // Delegate logging to PluginLogging
  log = {
    debug: <T extends string>(message: T, ...meta: SmartLogMeta<T>) =>
      this._logging.debug(this._trace, message, ...meta),

    info: <T extends string>(message: T, ...meta: SmartLogMeta<T>) =>
      this._logging.info(this._trace, message, ...meta),

    warn: <T extends string>(message: T, ...meta: SmartLogMeta<T>) =>
      this._logging.warn(this._trace, message, ...meta),

    error: <T extends string>(messageOrError: T | Error, ...meta: SmartLogMeta<T>) => {
      if (messageOrError instanceof BSBError) {
        this._logging.error(messageOrError);
      } else if (messageOrError instanceof Error) {
        (this._logging.error as any)(this._trace, messageOrError.message);
      } else {
        this._logging.error(this._trace, messageOrError, ...meta);
      }
    }
  };

  // Delegate metrics to PluginMetrics
  metrics = {
    counter: <LABELS extends string | undefined>(
      name: string,
      description: string,
      help: string,
      labels?: LABELS[]
    ) => this._metrics.createCounter(name, description, help, labels),

    gauge: <LABELS extends string | undefined>(
      name: string,
      description: string,
      help: string,
      labels?: LABELS[]
    ) => this._metrics.createGauge(name, description, help, labels),

    histogram: <LABELS extends string | undefined>(
      name: string,
      description: string,
      help: string,
      boundaries?: number[],
      labels?: LABELS[]
    ) => this._metrics.createHistogram(name, description, help, boundaries, labels),

    timer: () => this._metrics.createTimer()
  };

  // Create child span with inherited attributes
  span(
    name: string,
    attributes?: Record<string, string | number | boolean>
  ): Observable<TAttributeSchema> {
    const mergedAttributes = { ...this._attributes, ...attributes };
    const childSpan = this._metrics.createSpan(this._trace, name, mergedAttributes);

    return new PluginObservable(
      childSpan.trace,
      this._resource,
      this._logging,
      this._metrics,
      mergedAttributes,
      childSpan
    );
  }

  // Immutable attribute setting
  setAttribute<K extends string, V extends string | number | boolean>(
    key: K,
    value: V
  ): Observable<TAttributeSchema> {
    return new PluginObservable(
      this._trace,
      this._resource,
      this._logging,
      this._metrics,
      { ...this._attributes, [key]: value },
      this._span
    );
  }

  setAttributes(
    attrs: Record<string, string | number | boolean>
  ): Observable<TAttributeSchema> {
    return new PluginObservable(
      this._trace,
      this._resource,
      this._logging,
      this._metrics,
      { ...this._attributes, ...attrs },
      this._span
    );
  }

  // Record error to both span and logs
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
      this._logging.error(error);
    } else {
      this._logging.error(this._trace, error.message);
    }
  }

  // End span if this was created via span()
  end(attributes?: Record<string, string | number | boolean>): void {
    if (this._span) {
      const mergedAttrs = { ...this._attributes, ...attributes };
      this._span.end(mergedAttrs);
    }
  }
}
