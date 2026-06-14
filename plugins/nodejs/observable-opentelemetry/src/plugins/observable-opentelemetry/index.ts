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

import { BSBObservable, BSBObservableConstructor, createConfigSchema, LogFormatter, BSBError } from "@bsb/base";
import { DTrace, LogMeta } from "@bsb/base";
import * as av from "anyvali";
import * as api from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { PeriodicExportingMetricReader, MeterProvider } from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import type { Logger } from "@opentelemetry/api-logs";

/**
 * Configuration schema for OpenTelemetry plugin
 */
export const OpenTelemetryConfigSchema = av.object({
  serviceName: av.string().default("bsb-service").describe("Service name reported through OpenTelemetry resource attributes"),
  serviceVersion: av.optional(av.string()).describe("Optional service version reported through OpenTelemetry resource attributes"),
  endpoint: av.string().format("url").default("http://localhost:4318").describe("OTLP collector endpoint base URL"),
  export: av.object({
    protocol: av.enum_(["http"]).default("http").describe("OTLP HTTP transport protocol setting"),
    interval: av.int32().min(100).default(5000).describe("Metric export interval in milliseconds"),
    maxBatchSize: av.int32().min(1).default(512).describe("Maximum number of telemetry items sent in one export batch"),
  }, { unknownKeys: "strip" }).describe("OpenTelemetry export settings"),
  enabled: av.object({
    traces: av.bool().default(true).describe("Whether trace export is enabled"),
    metrics: av.bool().default(true).describe("Whether metric export is enabled"),
    logs: av.bool().default(true).describe("Whether log export is enabled"),
  }, { unknownKeys: "strip" }).describe("Telemetry signal enablement"),
  resourceAttributes: av.record(av.string()).default({}).describe("Additional OpenTelemetry resource attributes attached to exported telemetry"),
  samplingRate: av.number().min(0).max(1).default(1.0).describe("Trace sampling rate from 0.0 to 1.0"),
}, { unknownKeys: "strip" }).describe("OpenTelemetry observable plugin configuration");

export type OpenTelemetryConfig = av.Infer<typeof OpenTelemetryConfigSchema>;

export const Config = createConfigSchema(
  {
    name: 'observable-opentelemetry',
    description: 'OpenTelemetry integration for logs, metrics, and traces via OTLP',
    image: './observable-opentelemetry.png',
    tags: ['opentelemetry', 'otlp', 'observability', 'logs', 'metrics', 'traces'],
    documentation: ['./docs/plugin.md'],
  },
  OpenTelemetryConfigSchema
);

/**
 * Convert BSB log level to OpenTelemetry severity number
 */
function bsbLevelToOtelSeverity(level: string): number {
  const normalized = level.toLowerCase();
  switch (normalized) {
    case "debug":
      return 5; // DEBUG
    case "info":
      return 9; // INFO
    case "warn":
    case "warning":
      return 13; // WARN
    case "error":
      return 17; // ERROR
    default:
      return 9; // Default to INFO
  }
}

/**
 * Convert BSB log level to OpenTelemetry severity text
 */
function bsbLevelToOtelSeverityText(level: string): string {
  const normalized = level.toLowerCase();
  switch (normalized) {
    case "debug":
      return "DEBUG";
    case "info":
      return "INFO";
    case "warn":
    case "warning":
      return "WARN";
    case "error":
      return "ERROR";
    default:
      return "INFO";
  }
}

/**
 * OpenTelemetry observable plugin with OTLP export
 */
export class Plugin extends BSBObservable<InstanceType<typeof Config>> {
  static Config = Config;
  private logFormatter = new LogFormatter();
  private sdk: NodeSDK | null = null;
  private tracer: api.Tracer | null = null;
  private meter: api.Meter | null = null;
  private logger: Logger | null = null;
  private loggerProvider: LoggerProvider | null = null;
  private isDisposed = false;

  // Cache for metrics
  private counters = new Map<string, api.Counter>();
  private gauges = new Map<string, api.ObservableGauge>();
  private histograms = new Map<string, api.Histogram>();

  // Cache for active spans
  private spans = new Map<string, api.Span>();

  constructor(config: BSBObservableConstructor<InstanceType<typeof Config>>) {
    super(config);
  }

  public async init(): Promise<void> {
    // Create resource with service information
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: this.config.serviceName,
      ...(this.config.serviceVersion && { [ATTR_SERVICE_VERSION]: this.config.serviceVersion }),
      ...this.config.resourceAttributes,
    });

    // Configure exporters
    const traceExporter = new OTLPTraceExporter({
      url: `${this.config.endpoint}/v1/traces`,
    });

    const metricExporter = new OTLPMetricExporter({
      url: `${this.config.endpoint}/v1/metrics`,
    });

    const logExporter = new OTLPLogExporter({
      url: `${this.config.endpoint}/v1/logs`,
    });

    // Initialize SDK
    this.sdk = new NodeSDK({
      resource,
      traceExporter: this.config.enabled.traces ? traceExporter : undefined,
    });

    await this.sdk.start();

    // Get tracer
    if (this.config.enabled.traces) {
      this.tracer = api.trace.getTracer(this.config.serviceName, this.config.serviceVersion);
    }

    // Setup metrics separately
    if (this.config.enabled.metrics) {
      const meterProvider = new MeterProvider({
        resource,
        readers: [
          new PeriodicExportingMetricReader({
            exporter: metricExporter,
            exportIntervalMillis: this.config.export.interval,
          }),
        ],
      });
      this.meter = meterProvider.getMeter(this.config.serviceName, this.config.serviceVersion);
    }

    // Setup logs separately
    if (this.config.enabled.logs) {
      this.loggerProvider = new LoggerProvider({
        resource,
        processors: [new BatchLogRecordProcessor(logExporter)],
      });
      this.logger = this.loggerProvider.getLogger(this.config.serviceName, this.config.serviceVersion);
    }
  }

  public async run(): Promise<void> {
    // No runtime setup needed
  }

  /**
   * Map DTrace to OpenTelemetry trace context
   */
  private getTraceContext(trace: DTrace): api.Context {
    // Convert DTrace.t (trace ID) and DTrace.s (span ID) to OpenTelemetry format
    // BSB uses string IDs, OpenTelemetry uses hex format
    const traceId = trace.t.padStart(32, "0").substring(0, 32);
    const spanId = trace.s.padStart(16, "0").substring(0, 16);

    const spanContext: api.SpanContext = {
      traceId,
      spanId,
      traceFlags: api.TraceFlags.SAMPLED,
    };

    return api.trace.setSpanContext(api.context.active(), spanContext);
  }

  /**
   * Write log entry via OpenTelemetry
   */
  private writeLog(
    level: string,
    trace: DTrace,
    pluginName: string,
    message: string,
    meta?: LogMeta<any>
  ): void {
    if (!this.logger || this.isDisposed) {
      return;
    }

    const formattedMessage = this.logFormatter.formatLog(trace, message, meta);
    const context = this.getTraceContext(trace);

    this.logger.emit({
      severityNumber: bsbLevelToOtelSeverity(level),
      severityText: bsbLevelToOtelSeverityText(level),
      body: formattedMessage,
      attributes: {
        "bsb.plugin": pluginName,
        "bsb.trace.t": trace.t,
        "bsb.trace.s": trace.s,
        ...(meta && Object.keys(meta).length > 0 ? { "bsb.meta": JSON.stringify(meta) } : {}),
      },
      context,
    });
  }

  // Logging methods
  public debug(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void {
    if (this.mode === "production") {
      return;
    }
    this.writeLog("debug", trace, pluginName, message, meta);
  }

  public info(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void {
    this.writeLog("info", trace, pluginName, message, meta);
  }

  public warn(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void {
    this.writeLog("warn", trace, pluginName, message, meta);
  }

  public error(trace: DTrace, pluginName: string, message: string | BSBError<any>, meta?: LogMeta<any>): void {
    if (message instanceof BSBError) {
      if (message.raw !== null) {
        this.writeLog("error", message.raw.trace, pluginName, message.raw.message, message.raw.meta);
      } else {
        this.writeLog("error", trace, pluginName, message.message);
      }
    } else {
      this.writeLog("error", trace, pluginName, message, meta);
    }
  }

  // Metrics methods
  public createCounter(
    timestamp: number,
    pluginName: string,
    name: string,
    description: string,
    help: string,
    labels?: string[]
  ): void {
    if (!this.meter || this.isDisposed) {
      return;
    }

    const fullName = `${pluginName}.${name}`;
    if (!this.counters.has(fullName)) {
      const counter = this.meter.createCounter(fullName, {
        description: description || help,
      });
      this.counters.set(fullName, counter);
    }
  }

  public incrementCounter(
    timestamp: number,
    pluginName: string,
    name: string,
    value: number,
    labels?: Record<string, string>
  ): void {
    if (!this.meter || this.isDisposed) {
      return;
    }

    const fullName = `${pluginName}.${name}`;
    const counter = this.counters.get(fullName);
    if (counter) {
      counter.add(value, labels);
    }
  }

  public createGauge(
    timestamp: number,
    pluginName: string,
    name: string,
    description: string,
    help: string,
    labels?: string[]
  ): void {
    if (!this.meter || this.isDisposed) {
      return;
    }

    const fullName = `${pluginName}.${name}`;
    if (!this.gauges.has(fullName)) {
      let currentValue = 0;
      const gauge = this.meter.createObservableGauge(fullName, {
        description: description || help,
      });
      gauge.addCallback((observableResult) => {
        observableResult.observe(currentValue);
      });
      this.gauges.set(fullName, gauge);
    }
  }

  public setGauge(
    timestamp: number,
    pluginName: string,
    name: string,
    value: number,
    labels?: Record<string, string>
  ): void {
    // OpenTelemetry ObservableGauge doesn't support direct setting
    // Would need to use UpDownCounter instead or maintain state
    // For now, log a warning
    console.warn(`[observable-opentelemetry] setGauge not fully supported in OpenTelemetry, use UpDownCounter`);
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
    if (!this.meter || this.isDisposed) {
      return;
    }

    const fullName = `${pluginName}.${name}`;
    if (!this.histograms.has(fullName)) {
      const histogram = this.meter.createHistogram(fullName, {
        description: description || help,
      });
      this.histograms.set(fullName, histogram);
    }
  }

  public observeHistogram(
    timestamp: number,
    pluginName: string,
    name: string,
    value: number,
    labels?: Record<string, string>
  ): void {
    if (!this.meter || this.isDisposed) {
      return;
    }

    const fullName = `${pluginName}.${name}`;
    const histogram = this.histograms.get(fullName);
    if (histogram) {
      histogram.record(value, labels);
    }
  }

  // Tracing methods
  public spanStart(
    trace: DTrace,
    pluginName: string,
    spanName: string,
    parentSpanId: string | null,
    attributes?: Record<string, string | number | boolean>
  ): void {
    if (!this.tracer || this.isDisposed) {
      return;
    }

    const context = this.getTraceContext(trace);
    const span = this.tracer.startSpan(
      spanName,
      {
        attributes: {
          "bsb.plugin": pluginName,
          ...(parentSpanId ? { "bsb.parent_span_id": parentSpanId } : {}),
          ...attributes,
        },
      },
      context
    );

    const spanKey = `${trace.t}:${trace.s}`;
    this.spans.set(spanKey, span);
  }

  public spanEnd(
    trace: DTrace,
    pluginName: string,
    attributes?: Record<string, string | number | boolean>
  ): void {
    if (this.isDisposed) {
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
    if (this.isDisposed) {
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

    // End all active spans
    for (const span of this.spans.values()) {
      span.end();
    }
    this.spans.clear();

    // Shutdown SDK
    if (this.sdk) {
      await this.sdk.shutdown();
      this.sdk = null;
    }

    this.tracer = null;
    this.meter = null;
    this.logger = null;
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}
