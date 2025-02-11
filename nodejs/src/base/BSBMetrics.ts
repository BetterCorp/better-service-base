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

import { DTrace } from '../interfaces/metrics';
import { BaseWithConfig, BaseWithConfigConfig } from "./base";
import { BSB_ERROR_METHOD_NOT_IMPLEMENTED, BSBError } from "./errorMessages";
import { BSBReferencePluginConfigDefinition, BSBReferencePluginConfigType } from "./PluginConfig";

export interface BSBMetricsConstructor<
  ReferencedConfig extends BSBReferencePluginConfigType = any
>
  extends BaseWithConfigConfig<
    ReferencedConfig extends null
    ? null
    : BSBReferencePluginConfigDefinition<ReferencedConfig>
  > {
}

/**
 * @group Metrics
 * @category Plugin Development
 * @template T - The type of config for the plugin
 * Abstract class representing the configuration for the Better Service Base.
 */
export abstract class BSBMetrics<
  ReferencedConfig extends BSBReferencePluginConfigType = any
>
  extends BaseWithConfig<
    ReferencedConfig extends null
    ? null
    : BSBReferencePluginConfigDefinition<ReferencedConfig>
  > {
  constructor(config: BSBMetricsConstructor<ReferencedConfig>) {
    super(config);
  }

  public abstract createCounter(timestamp: number, pluginName: string, name: string, description: string, help: string, labels?: string[]): void | Promise<void>;

  public abstract updateCounter(timestamp: number, event: "inc", pluginName: string, name: string, value: number, labels?: Record<string, string>): void | Promise<void>;

  public abstract createGauge(timestamp: number, pluginName: string, name: string, description: string, help: string, labels?: string[]): void | Promise<void>;

  public abstract updateGauge(timestamp: number, event: "set" | "inc" | "dec", pluginName: string, name: string, value: number, labels?: Record<string, string>): void | Promise<void>;

  public abstract createHistogram(timestamp: number, pluginName: string, name: string, description: string, help: string, boundaries?: number[], labels?: string[]): void | Promise<void>;

  public abstract updateHistogram(timestamp: number, event: "record", pluginName: string, name: string, value: number, labels?: Record<string, string>): void | Promise<void>;

  public abstract startTrace(timestamp: number, appId: string, pluginName: string, traceId: string): void | Promise<void>;

  public abstract endTrace(timestamp: number, appId: string, pluginName: string, traceId: string, attributes?: Record<string, string>): void | Promise<void>;

  public abstract startSpan(timestamp: number, appId: string, pluginName: string, traceId: string, spanId: string, name: string, parentSpanId?: string, attributes?: Record<string, string>): void | Promise<void>;

  public abstract endSpan(timestamp: number, appId: string, pluginName: string, traceId: string, spanId: string, attributes?: Record<string, string>): void | Promise<void>;

  public abstract errorSpan(timestamp: number, appId: string, pluginName: string, traceId: string, spanId: string, error: BSBError<any> | Error, attributes?: Record<string, string>): void | Promise<void>;
}

/**
 * @hidden
 * DO NOT REFERENCE/USE THIS CLASS - IT IS AN INTERNALLY REFERENCED CLASS
 */
export class BSBMetricsRef
  extends BSBMetrics {
  dispose?(): void;

  init?(trace: DTrace): void;

  run?(trace: DTrace): void;

  createCounter(timestamp: number, pluginName: string, name: string, description: string, help: string, labels?: string[]): void | Promise<void> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBMetricsRef", "createCounter");
  }

  createGauge(timestamp: number, pluginName: string, name: string, description: string, help: string, labels?: string[]): void | Promise<void> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBMetricsRef", "createGauge");
  }

  createHistogram(timestamp: number, pluginName: string, name: string, description: string, help: string, boundaries: number[] | undefined, labels?: string[]): void | Promise<void> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBMetricsRef", "createHistogram");
  }

  endSpan(timestamp: number, appId: string, pluginName: string, traceId: string, spanId: string, attributes: Record<string, string> | undefined): void | Promise<void> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBMetricsRef", "endSpan");
  }

  endTrace(timestamp: number, appId: string, pluginName: string, traceId: string, attributes: Record<string, string> | undefined): void | Promise<void> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBMetricsRef", "endTrace");
  }

  errorSpan(timestamp: number, appId: string, pluginName: string, traceId: string, spanId: string, error: BSBError<any> | Error, attributes: Record<string, string> | undefined): void | Promise<void> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBMetricsRef", "errorSpan");
  }

  startSpan(timestamp: number, appId: string, pluginName: string, traceId: string, spanId: string, name: string, parentSpanId?: string, attributes?: Record<string, string>): void | Promise<void> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBMetricsRef", "startSpan");
  }

  startTrace(timestamp: number, appId: string, pluginName: string, traceId: string): void | Promise<void> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBMetricsRef", "startTrace");
  }

  updateCounter(timestamp: number, event: "inc", pluginName: string, name: string, value: number, labels?: Record<string, string>): void | Promise<void> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBMetricsRef", "counterEvent");
  }

  updateGauge(timestamp: number, event: "set" | "inc" | "dec", pluginName: string, name: string, value: number, labels?: Record<string, string>): void | Promise<void> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBMetricsRef", "gaugeEvent");
  }

  updateHistogram(timestamp: number, event: "record", pluginName: string, name: string, value: number, labels?: Record<string, string>): void | Promise<void> {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBMetricsRef", "histogramEvent");
  }
}