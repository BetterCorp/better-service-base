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

import {
  BSBObservable,
  BSBObservableConstructor,
  createConfigSchema,
  LogFormatter,
  BSBError
} from "@bsb/base";
import { DTrace, LogMeta } from "@bsb/base";
import * as av from "@anyvali/js";
import { Axiom } from "@axiomhq/js";
import * as api from "@opentelemetry/api";
import { defaultResource, resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import type { IdGenerator } from "@opentelemetry/sdk-trace-base";

const ConfigSchema = av.object({
  serviceName: av.optional(av.string()).default("bsb-service"),
  serviceVersion: av.optional(av.string()),
  axiom: av.object({
    token: av.string(),
    dataset: av.optional(av.string()).default("bsb-logs"),
    orgId: av.optional(av.string()),
    url: av.optional(av.string().format("url")),
  }, { unknownKeys: "strip" }),
  enabled: av.object({
    logs: av.optional(av.bool()).default(true),
    metrics: av.optional(av.bool()).default(true),
    traces: av.optional(av.bool()).default(true),
  }, { unknownKeys: "strip" }),
  export: av.object({
    flushIntervalMs: av.optional(av.int32().min(100)).default(5000),
    maxBatchSize: av.optional(av.int32().min(1)).default(1000),
  }, { unknownKeys: "strip" }),
  resourceAttributes: av.optional(av.record(av.string())).default({}),
}, { unknownKeys: "strip" });

export const Config = createConfigSchema(
  {
    name: 'observable-axiom',
    description: 'Axiom.co observability integration for logs, metrics, and traces',
    version: '1.0.0',
    image: './axiom-co-logo.png',
    tags: ['axiom', 'observability', 'logs', 'metrics', 'traces', 'analytics'],
  },
  ConfigSchema
);

/**
 * Custom ID generator that uses BSB's trace and span IDs
 */
class BSBIdGenerator implements IdGenerator {
  private currentTrace: DTrace | null = null;

  setCurrentTrace(trace: DTrace): void {
    this.currentTrace = trace;
  }

  clearCurrentTrace(): void {
    this.currentTrace = null;
  }

  generateTraceId(): string {
    if (this.currentTrace) {
      // BSB now generates OpenTelemetry-compliant IDs (32 hex chars, no hyphens)
      return this.currentTrace.t;
    }
    // Fallback: generate random ID (should not happen in normal flow)
    return this.randomHex(32);
  }

  generateSpanId(): string {
    if (this.currentTrace) {
      // BSB now generates OpenTelemetry-compliant IDs (16 hex chars, no hyphens)
      return this.currentTrace.s;
    }
    // Fallback: generate random ID (should not happen in normal flow)
    return this.randomHex(16);
  }

  private randomHex(length: number): string {
    const bytes = new Uint8Array(length / 2);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

/**
 * Axiom observable plugin for unified observability
 *
 * Exports logs and events to Axiom using official SDK
 * Exports traces via OTLP (Axiom supports OpenTelemetry)
 * Exports metrics as structured events
 */
export class Plugin extends BSBObservable<InstanceType<typeof Config>> {
  static Config = Config;

  private logFormatter = new LogFormatter();
  private axiom: Axiom | null = null;
  private tracerProvider: NodeTracerProvider | null = null;
  private tracer: api.Tracer | null = null;
  private idGenerator: BSBIdGenerator | null = null;
  private isDisposed = false;

  private spans = new Map<string, api.Span>();
  private pendingLogs: Array<Record<string, unknown>> = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(config: BSBObservableConstructor<InstanceType<typeof Config>>) {
    super(config);
  }

  public async init(): Promise<void> {
    // Initialize Axiom client for logs and events
    if (this.config.enabled.logs || this.config.enabled.metrics) {
      const axiomOptions: {
        token: string;
        orgId?: string;
        url?: string;
      } = {
        token: this.config.axiom.token,
      };

      if (this.config.axiom.orgId) {
        axiomOptions.orgId = this.config.axiom.orgId;
      }

      if (this.config.axiom.url) {
        axiomOptions.url = this.config.axiom.url;
      }

      this.axiom = new Axiom(axiomOptions);
    }

    // Initialize OpenTelemetry for traces (Axiom supports OTLP natively)
    if (this.config.enabled.traces) {
      const resource = defaultResource().merge(
        resourceFromAttributes({
          [ATTR_SERVICE_NAME]: this.config.serviceName,
          ...(this.config.serviceVersion && { [ATTR_SERVICE_VERSION]: this.config.serviceVersion }),
          ...this.config.resourceAttributes,
        })
      );

      // Axiom OTLP endpoint (from docs: https://axiom.co/docs/send-data/opentelemetry)
      const otlpUrl = this.config.axiom.url
        ? `${this.config.axiom.url}/v1/traces`
        : `https://api.axiom.co/v1/traces`;

      const traceExporter = new OTLPTraceExporter({
        url: otlpUrl,
        headers: {
          "Authorization": `Bearer ${this.config.axiom.token}`,
          "X-Axiom-Dataset": this.config.axiom.dataset,
        },
      });

      // Create custom ID generator that uses BSB's trace and span IDs
      this.idGenerator = new BSBIdGenerator();

      // Create tracer provider with custom ID generator and span processor
      // Use shorter batch delay for faster exports during debugging
      this.tracerProvider = new NodeTracerProvider({
        resource,
        idGenerator: this.idGenerator,
        spanProcessors: [
          new BatchSpanProcessor(traceExporter, {
            scheduledDelayMillis: 1000, // Export every 1 second (default is 5000)
            maxQueueSize: 2048,
            maxExportBatchSize: 512,
          })
        ],
      });

      // Register the provider globally
      this.tracerProvider.register();

      this.tracer = this.tracerProvider.getTracer(
        this.config.serviceName,
        this.config.serviceVersion
      );
    }

    // Start periodic flush for logs
    if (this.config.enabled.logs) {
      this.flushTimer = setInterval(() => {
        this.flushLogs().catch((error) => {
          console.error("[observable-axiom] Failed to flush logs:", error);
        });
      }, this.config.export.flushIntervalMs);
    }
  }

  public async run(): Promise<void> {
    // No runtime setup needed
  }

  /**
   * Flush pending logs to Axiom
   */
  private async flushLogs(): Promise<void> {
    if (!this.axiom || this.pendingLogs.length === 0 || this.isDisposed) {
      return;
    }

    const batch = this.pendingLogs.splice(0, this.config.export.maxBatchSize);

    try {
      await this.axiom.ingest(this.config.axiom.dataset, batch);
    } catch (error) {
      console.error("[observable-axiom] Failed to ingest logs:", error);
      // Don't re-add to queue to avoid memory leak
    }
  }

  /**
   * Add log entry to batch
   */
  private queueLog(
    level: string,
    trace: DTrace,
    pluginName: string,
    message: string,
    meta?: LogMeta<any>
  ): void {
    if (!this.config.enabled.logs || this.isDisposed) {
      return;
    }

    const formattedMessage = this.logFormatter.formatLog(trace, message, meta);

    // BSB now generates OpenTelemetry-compliant IDs directly
    // Trace ID: 32 hex chars, Span ID: 16 hex chars
    const traceId = trace.t;
    const spanId = trace.s;

    const logEntry: Record<string, unknown> = {
      _time: new Date().toISOString(),
      level: level.toLowerCase(),
      service: this.config.serviceName,
      plugin: pluginName,
      message: formattedMessage,
      trace_id: traceId,
      span_id: spanId,
    };

    if (this.config.serviceVersion) {
      logEntry.version = this.config.serviceVersion;
    }

    if (meta && Object.keys(meta).length > 0) {
      logEntry.meta = meta;
    }

    // Add resource attributes
    for (const [key, value] of Object.entries(this.config.resourceAttributes)) {
      logEntry[`resource.${key}`] = value;
    }

    this.pendingLogs.push(logEntry);

    // Flush immediately if batch is full
    if (this.pendingLogs.length >= this.config.export.maxBatchSize) {
      this.flushLogs().catch((error) => {
        console.error("[observable-axiom] Failed to flush logs:", error);
      });
    }
  }


  // Logging methods
  // Note: debug() method intentionally not implemented - debug logs too verbose for cloud logging

  public info(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void {
    this.queueLog("info", trace, pluginName, message, meta);
  }

  public warn(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void {
    this.queueLog("warn", trace, pluginName, message, meta);
  }

  public error(trace: DTrace, pluginName: string, message: string | BSBError<any>, meta?: LogMeta<any>): void {
    if (message instanceof BSBError) {
      if (message.raw !== null) {
        this.queueLog("error", message.raw.trace, pluginName, message.raw.message, message.raw.meta);
      } else {
        this.queueLog("error", trace, pluginName, message.message);
      }
    } else {
      this.queueLog("error", trace, pluginName, message, meta);
    }
  }

  // Metrics methods - send as structured events to Axiom
  public createCounter(
    timestamp: number,
    pluginName: string,
    name: string,
    description: string,
    help: string,
    labels?: string[]
  ): void {
    if (!this.config.enabled.metrics || !this.axiom || this.isDisposed) {
      return;
    }

    // Axiom doesn't need metric creation, just send events when values change
  }

  public incrementCounter(
    timestamp: number,
    pluginName: string,
    name: string,
    value: number,
    labels?: Record<string, string>
  ): void {
    if (!this.config.enabled.metrics || !this.axiom || this.isDisposed) {
      return;
    }

    const event: Record<string, unknown> = {
      _time: new Date(timestamp).toISOString(),
      metric_type: "counter",
      service: this.config.serviceName,
      plugin: pluginName,
      metric_name: name,
      value,
      ...labels,
    };

    this.pendingLogs.push(event);
  }

  public createGauge(
    timestamp: number,
    pluginName: string,
    name: string,
    description: string,
    help: string,
    labels?: string[]
  ): void {
    // No-op for Axiom
  }

  public setGauge(
    timestamp: number,
    pluginName: string,
    name: string,
    value: number,
    labels?: Record<string, string>
  ): void {
    if (!this.config.enabled.metrics || !this.axiom || this.isDisposed) {
      return;
    }

    const event: Record<string, unknown> = {
      _time: new Date(timestamp).toISOString(),
      metric_type: "gauge",
      service: this.config.serviceName,
      plugin: pluginName,
      metric_name: name,
      value,
      ...labels,
    };

    this.pendingLogs.push(event);
  }

  public createHistogram(
    timestamp: number,
    pluginName: string,
    name: string,
    description: string,
    help: string,
    boundaries?: number[],
    labels?: string[]
  ): void {
    // No-op for Axiom
  }

  public observeHistogram(
    timestamp: number,
    pluginName: string,
    name: string,
    value: number,
    labels?: Record<string, string>
  ): void {
    if (!this.config.enabled.metrics || !this.axiom || this.isDisposed) {
      return;
    }

    const event: Record<string, unknown> = {
      _time: new Date(timestamp).toISOString(),
      metric_type: "histogram",
      service: this.config.serviceName,
      plugin: pluginName,
      metric_name: name,
      value,
      ...labels,
    };

    this.pendingLogs.push(event);
  }

  /**
   * Check if a trace is internal (should not create spans)
   */
  private isInternalTrace(trace: DTrace): boolean {
    return trace.t.startsWith('INTERNAL:');
  }

  // Tracing methods - uses OpenTelemetry OTLP export to Axiom
  public spanStart(
    trace: DTrace,
    pluginName: string,
    spanName: string,
    parentSpanId: string | null,
    attributes?: Record<string, string | number | boolean>
  ): void {
    if (!this.tracer || !this.idGenerator || !this.config.enabled.traces || this.isDisposed) {
      return;
    }

    // Skip internal traces
    if (this.isInternalTrace(trace)) {
      return;
    }

    // Set the current trace so the ID generator uses BSB's IDs
    this.idGenerator.setCurrentTrace(trace);

    // Get parent span context if there's a parent
    let parentContext;
    if (parentSpanId) {
      const parentKey = `${trace.t}:${parentSpanId}`;
      const parentSpan = this.spans.get(parentKey);
      if (parentSpan) {
        parentContext = api.trace.setSpan(api.context.active(), parentSpan);
      }
    }

    const span = this.tracer.startSpan(
      spanName,
      {
        attributes: attributes,
      },
      parentContext
    );

    // Clear the current trace after span creation
    this.idGenerator.clearCurrentTrace();

    const spanKey = `${trace.t}:${trace.s}`;
    this.spans.set(spanKey, span);
  }

  public spanEnd(
    trace: DTrace,
    pluginName: string,
    attributes?: Record<string, string | number | boolean>
  ): void {
    if (!this.config.enabled.traces || this.isDisposed) {
      return;
    }

    // Skip internal traces
    if (this.isInternalTrace(trace)) {
      return;
    }

    const spanKey = `${trace.t}:${trace.s}`;
    const span = this.spans.get(spanKey);
    if (span) {
      if (attributes) {
        span.setAttributes(attributes);
      }
      span.end();
      this.spans.delete(spanKey);
    }
  }

  public spanError(
    trace: DTrace,
    pluginName: string,
    error: Error,
    attributes?: Record<string, string | number | boolean>
  ): void {
    if (!this.config.enabled.traces || this.isDisposed) {
      return;
    }

    // Skip internal traces
    if (this.isInternalTrace(trace)) {
      return;
    }

    const spanKey = `${trace.t}:${trace.s}`;
    const span = this.spans.get(spanKey);
    if (span) {
      span.recordException(error);
      span.setStatus({ code: api.SpanStatusCode.ERROR, message: error.message });
      if (attributes) {
        span.setAttributes(attributes);
      }
    }
  }

  public async dispose(): Promise<void> {
    this.isDisposed = true;

    // Stop flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush remaining logs
    await this.flushLogs();

    // Clear any active spans (but don't end them - they should already be ended)
    this.spans.clear();

    // Shutdown OpenTelemetry tracer provider (this will flush pending spans)
    if (this.tracerProvider) {
      await this.tracerProvider.shutdown();
      this.tracerProvider = null;
    }

    this.tracer = null;
    this.idGenerator = null;
    this.axiom = null;
  }
}
