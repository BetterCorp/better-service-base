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

/* eslint-disable @typescript-eslint/no-unused-vars */
import { DTrace, LogMeta } from "../interfaces/index.js";
import { BaseWithConfig, BaseWithConfigConfig } from "./base.js";
import { BSB_ERROR_METHOD_NOT_IMPLEMENTED, BSBError } from "./errorMessages.js";
import { BSBReferencePluginConfigDefinition, BSBReferencePluginConfigType } from "./PluginConfig.js";

export interface BSBObservableConstructor<
  ReferencedConfig extends BSBReferencePluginConfigType = any
>
  extends BaseWithConfigConfig<
    ReferencedConfig extends null
    ? null
    : BSBReferencePluginConfigDefinition<ReferencedConfig> & any
  > {}

/**
 * Unified Observable plugin base class for logging, metrics, and tracing
 * @group Observable
 * @category Plugins
 * @template ReferencedConfig - The type of configuration for the plugin
 * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBObservable.html | API: BSBObservable}
 */
export abstract class BSBObservable<
  ReferencedConfig extends BSBReferencePluginConfigType = any
> extends BaseWithConfig<
  ReferencedConfig extends null
  ? null
  : BSBReferencePluginConfigDefinition<ReferencedConfig> & any
> {
  constructor(config: BSBObservableConstructor<ReferencedConfig>) {
    super(config);
  }

  /**
   * Logging: Debug level
   * @param trace - Trace for tracking the operation
   * @param pluginName - Name of the plugin emitting the log
   * @param message - Log message
   * @param meta - Metadata
   */
  debug?(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void;

  /**
   * Logging: Info level
   * @param trace - Trace for tracking the operation
   * @param pluginName - Name of the plugin emitting the log
   * @param message - Log message
   * @param meta - Metadata
   */
  info?(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void;

  /**
   * Logging: Warn level
   * @param trace - Trace for tracking the operation
   * @param pluginName - Name of the plugin emitting the log
   * @param message - Log message
   * @param meta - Metadata
   */
  warn?(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void;

  /**
   * Logging: Error level
   * @param trace - Trace for tracking the operation
   * @param pluginName - Name of the plugin emitting the log
   * @param message - Log message or error object
   * @param meta - Metadata
   */
  error?(trace: DTrace, pluginName: string, message: string | BSBError<any>, meta?: LogMeta<any>): void;

  /**
   * Metrics: Counter creation
   * @param timestamp - Timestamp of the metric
   * @param pluginName - Name of the plugin emitting the metric
   * @param name - Metric name
   * @param description - Metric description
   * @param help - Help text
   * @param labels - Optional labels
   */
  createCounter?(
    timestamp: number,
    pluginName: string,
    name: string,
    description: string,
    help: string,
    labels?: string[]
  ): void | Promise<void>;

  /**
   * Metrics: Gauge creation
   * @param timestamp - Timestamp of the metric
   * @param pluginName - Name of the plugin emitting the metric
   * @param name - Metric name
   * @param description - Metric description
   * @param help - Help text
   * @param labels - Optional labels
   */
  createGauge?(
    timestamp: number,
    pluginName: string,
    name: string,
    description: string,
    help: string,
    labels?: string[]
  ): void | Promise<void>;

  /**
   * Metrics: Histogram creation
   * @param timestamp - Timestamp of the metric
   * @param pluginName - Name of the plugin emitting the metric
   * @param name - Metric name
   * @param description - Metric description
   * @param help - Help text
   * @param boundaries - Histogram boundaries
   * @param labels - Optional labels
   */
  createHistogram?(
    timestamp: number,
    pluginName: string,
    name: string,
    description: string,
    help: string,
    boundaries?: number[],
    labels?: string[]
  ): void | Promise<void>;

  /**
   * Metrics: Counter increment
   * @param timestamp - Timestamp of the metric
   * @param pluginName - Name of the plugin emitting the metric
   * @param name - Metric name
   * @param value - Increment value
   * @param labels - Optional label values
   */
  incrementCounter?(
    timestamp: number,
    pluginName: string,
    name: string,
    value: number,
    labels?: Record<string, string>
  ): void | Promise<void>;

  /**
   * Metrics: Gauge set
   * @param timestamp - Timestamp of the metric
   * @param pluginName - Name of the plugin emitting the metric
   * @param name - Metric name
   * @param value - Gauge value
   * @param labels - Optional label values
   */
  setGauge?(
    timestamp: number,
    pluginName: string,
    name: string,
    value: number,
    labels?: Record<string, string>
  ): void | Promise<void>;

  /**
   * Metrics: Histogram observe
   * @param timestamp - Timestamp of the metric
   * @param pluginName - Name of the plugin emitting the metric
   * @param name - Metric name
   * @param value - Observed value
   * @param labels - Optional label values
   */
  observeHistogram?(
    timestamp: number,
    pluginName: string,
    name: string,
    value: number,
    labels?: Record<string, string>
  ): void | Promise<void>;

  /**
   * Tracing: Span start
   * @param trace - Span trace (contains trace ID and new span ID)
   * @param pluginName - Name of the plugin creating the span
   * @param spanName - Name of the span
   * @param parentSpanId - Parent span ID (null for root spans)
   * @param attributes - Span attributes
   */
  spanStart?(
    trace: DTrace,
    pluginName: string,
    spanName: string,
    parentSpanId: string | null,
    attributes?: Record<string, string | number | boolean>
  ): void | Promise<void>;

  /**
   * Tracing: Span end
   * @param trace - Span trace
   * @param pluginName - Name of the plugin ending the span
   * @param attributes - Final attributes
   */
  spanEnd?(
    trace: DTrace,
    pluginName: string,
    attributes?: Record<string, string | number | boolean>
  ): void | Promise<void>;

  /**
   * Tracing: Span error
   * @param trace - Span trace
   * @param pluginName - Name of the plugin recording the error
   * @param error - Error object
   * @param attributes - Error attributes
   */
  spanError?(
    trace: DTrace,
    pluginName: string,
    error: Error,
    attributes?: Record<string, string | number | boolean>
  ): void | Promise<void>;
}

/**
 * @hidden
 * DO NOT REFERENCE/USE THIS CLASS - IT IS AN INTERNALLY REFERENCED CLASS
 */
export class BSBObservableRef extends BSBObservable {
  dispose?(): void;

  init?(): void | Promise<void>;
  run?(): void | Promise<void>;

  debug(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBObservableRef", "debug");
  }

  info(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBObservableRef", "info");
  }

  warn(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBObservableRef", "warn");
  }

  error(trace: DTrace, pluginName: string, message: string | BSBError<any>, meta?: LogMeta<any>): void {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBObservableRef", "error");
  }

  createCounter(
    timestamp: number,
    pluginName: string,
    name: string,
    description: string,
    help: string,
    labels?: string[]
  ): void {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBObservableRef", "createCounter");
  }

  createGauge(
    timestamp: number,
    pluginName: string,
    name: string,
    description: string,
    help: string,
    labels?: string[]
  ): void {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBObservableRef", "createGauge");
  }

  createHistogram(
    timestamp: number,
    pluginName: string,
    name: string,
    description: string,
    help: string,
    boundaries?: number[],
    labels?: string[]
  ): void {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBObservableRef", "createHistogram");
  }

  incrementCounter(
    timestamp: number,
    pluginName: string,
    name: string,
    value: number,
    labels?: Record<string, string>
  ): void {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBObservableRef", "incrementCounter");
  }

  setGauge(
    timestamp: number,
    pluginName: string,
    name: string,
    value: number,
    labels?: Record<string, string>
  ): void {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBObservableRef", "setGauge");
  }

  observeHistogram(
    timestamp: number,
    pluginName: string,
    name: string,
    value: number,
    labels?: Record<string, string>
  ): void {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBObservableRef", "observeHistogram");
  }

  spanStart(
    trace: DTrace,
    pluginName: string,
    spanName: string,
    parentSpanId: string | null,
    attributes?: Record<string, string | number | boolean>
  ): void {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBObservableRef", "spanStart");
  }

  spanEnd(
    trace: DTrace,
    pluginName: string,
    attributes?: Record<string, string | number | boolean>
  ): void {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBObservableRef", "spanEnd");
  }

  spanError(
    trace: DTrace,
    pluginName: string,
    error: Error,
    attributes?: Record<string, string | number | boolean>
  ): void {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBObservableRef", "spanError");
  }
}
