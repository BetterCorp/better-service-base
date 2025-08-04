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

import { BSBError } from "../..";
import { BSBMetrics } from "../../base/BSBMetrics";
import { DTrace, Timer } from "../../interfaces/metrics";
import { DEBUG_MODE } from "../../interfaces/logging";
import { CONSOLE_COLOURS } from "../logging-default/colours";

export interface MetricsConfig {
  appId: string;
  mode: DEBUG_MODE;
  pluginName: string;
  cwd: string;
  packageCwd: string;
  pluginCwd: string;
  pluginVersion: string;
  config: any;
}

export class Plugin extends BSBMetrics {
  public readonly mode: DEBUG_MODE;
  private readonly traces: Map<string, {
    startTime: number;
    spans: Map<string, {
      startTime: number;
      name: string;
      attributes?: Record<string, string>;
    }>;
    attributes?: Record<string, string>;
  }>;

  constructor(config: MetricsConfig) {
    super(config);
    this.mode = config.mode;
    this.traces = new Map();
  }

  private logMetric(
    level: string,
    name: string,
    value: string | number,
    attributes?: Record<string, string>
  ) {
    //if (this.mode === "production") return;

    const formattedAttributes = attributes ? JSON.stringify(attributes) : '';
    const message = `[${ level }] [${ name }] Value: ${ value }${ formattedAttributes ? ` Attributes: ${ formattedAttributes }` : '' }`;
    console.debug(CONSOLE_COLOURS.FgGreen, message, CONSOLE_COLOURS.Reset);
  }

  public async createCounter<LABELS extends string | undefined = undefined>(
    timestamp: number,
    pluginName: string,
    name: string,
    description: string,
    help: string,
    labels?: LABELS[]
  ): Promise<void> {
    this.logMetric('Counter', name, 'created', { description, help });
  }

  public async createGauge<LABELS extends string | undefined = undefined>(
    timestamp: number,
    pluginName: string,
    name: string,
    description: string,
    help: string,
    labels?: LABELS[]
  ): Promise<void> {
    this.logMetric('Gauge', name, 'created', { description, help });
  }

  public async createHistogram<LABELS extends string | undefined = undefined>(
    timestamp: number,
    pluginName: string,
    name: string,
    description: string,
    help: string,
    boundaries: number[],
    labels?: LABELS[]
  ): Promise<void> {
    this.logMetric('Histogram', name, 'created', { description, help, boundaries: boundaries.join(',') });
  }

  public async updateCounter<LABELS extends string | undefined = undefined>(
    timestamp: number,
    event: "inc",
    pluginName: string,
    name: string,
    value: number,
    labels?: LABELS extends string ? Partial<Record<LABELS, string>> : never
  ): Promise<void> {
    this.logMetric('Counter', name, value, labels as Record<string, string>);
  }

  public async updateGauge<LABELS extends string | undefined = undefined>(
    timestamp: number,
    event: "set" | "inc" | "dec",
    pluginName: string,
    name: string,
    value: number,
    labels?: LABELS extends string ? Partial<Record<LABELS, string>> : never
  ): Promise<void> {
    this.logMetric('Gauge', name, value, labels as Record<string, string>);
  }

  public async updateHistogram<LABELS extends string | undefined = undefined>(
    timestamp: number,
    event: "record",
    pluginName: string,
    name: string,
    value: number,
    labels?: LABELS extends string ? Partial<Record<LABELS, string>> : never
  ): Promise<void> {
    this.logMetric('Histogram', name, value, labels as Record<string, string>);
  }

  public createTimer(): Timer {
    const startTime = process.hrtime.bigint();
    return {
      stop: () => {
        const endTime = process.hrtime.bigint();
        return Number(endTime - startTime);
      }
    };
  }

  public async startTrace(
    timestamp: number,
    appId: string,
    pluginName: string,
    traceId: string
  ): Promise<void> {
    this.traces.set(traceId, {
      startTime: timestamp,
      spans: new Map()
    });
    this.logMetric('Trace', traceId, 'started');
  }

  public async endTrace(
    timestamp: number,
    appId: string,
    pluginName: string,
    traceId: string,
    attributes?: Record<string, string>
  ): Promise<void> {
    const trace = this.traces.get(traceId);
    if (trace) {
      trace.attributes = attributes;
      const duration = timestamp - trace.startTime;
      this.logMetric('Trace', traceId, `ended after ${ duration }ms`, attributes);
      this.traces.delete(traceId);
    }
  }

  public async startSpan(
    timestamp: number,
    appId: string,
    pluginName: string,
    traceId: string,
    spanId: string,
    name: string,
    parentSpanId: string | undefined,
    attributes?: Record<string, string>
  ): Promise<void> {
    const trace = this.traces.get(traceId);
    if (trace) {
      trace.spans.set(spanId, {
        startTime: timestamp,
        name,
        attributes
      });
      const spanAttributes = {
        ...attributes,
        ...(parentSpanId ? { parentSpanId } : {})
      };
      this.logMetric('Span', `${ traceId }:${ spanId }`, `started: ${ name }`, spanAttributes);
    }
  }

  public async endSpan(
    timestamp: number,
    appId: string,
    pluginName: string,
    traceId: string,
    spanId: string,
    attributes?: Record<string, string>
  ): Promise<void> {
    const trace = this.traces.get(traceId);
    if (trace) {
      const span = trace.spans.get(spanId);
      if (span) {
        const duration = timestamp - span.startTime;
        this.logMetric('Span', `${ traceId }:${ spanId }`, `ended after ${ duration }ms: ${ span.name }`, {
          ...span.attributes,
          ...attributes
        });
        trace.spans.delete(spanId);
      }
    }
  }

  public async errorSpan(
    timestamp: number,
    appId: string,
    pluginName: string,
    traceId: string,
    spanId: string,
    error: BSBError<any> | Error,
    attributes?: Record<string, string>
  ): Promise<void> {
    const trace = this.traces.get(traceId);
    if (trace) {
      const span = trace.spans.get(spanId);
      if (span) {
        this.logMetric('Span', `${ traceId }:${ spanId }`, `error: ${ error.message }`, {
          error: error.message,
          stack: error.stack || '',
          ...span.attributes,
          ...attributes
        });
      }
    }
  }

  public dispose(): void {
    this.traces.clear();
  }

  public init(): void {
    // Nothing to initialize
  }

  public run(trace: DTrace): void {
    // Nothing to run
  }
} 