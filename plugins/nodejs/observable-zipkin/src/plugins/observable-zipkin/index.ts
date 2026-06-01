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
import * as av from "anyvali";
import * as api from "@opentelemetry/api";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { BasicTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ZipkinExporter } from "@opentelemetry/exporter-zipkin";

const ConfigSchema = av.object({
    serviceName: av.optional(av.string()).default("bsb-service"),
    serviceVersion: av.optional(av.string()),
    zipkin: av.object({
      url: av.optional(av.string().format("url")).default("http://localhost:9411/api/v2/spans"),
      headers: av.optional(av.record(av.string())),
      statusCodeTagName: av.optional(av.string()).default("http.status_code"),
      statusDescriptionTagName: av.optional(av.string()).default("http.status_text"),
    }, { unknownKeys: "strip" }),
    export: av.object({
      maxBatchSize: av.optional(av.int32().min(1)).default(100),
      maxQueueSize: av.optional(av.int32().min(1)).default(2048),
      scheduledDelayMillis: av.optional(av.int32().min(100)).default(5000),
    }, { unknownKeys: "strip" }),
    resourceAttributes: av.optional(av.record(av.string())).default({}),
    samplingRate: av.optional(av.number().min(0).max(1)).default(1.0),
    console: av.object({
      enabled: av.optional(av.bool()).default(true),
      logLevel: av.optional(av.enum_(['debug', 'info', 'warn', 'error'])).default('info'),
    }, { unknownKeys: "strip" }),
  }, { unknownKeys: "strip" });

export const Config = createConfigSchema(
  {
    name: 'observable-zipkin',
    description: 'Zipkin tracing integration for BSB framework',
    tags: ['zipkin', 'tracing', 'observability', 'distributed-tracing'],
  },
  ConfigSchema
);

/**
 * Zipkin observable plugin for distributed tracing
 *
 * Exports traces directly to Zipkin using the Zipkin v2 API format.
 * Provides console logging fallback for non-trace observability.
 */
export class Plugin extends BSBObservable<InstanceType<typeof Config>> {
  static Config = Config;

  private logFormatter = new LogFormatter();
  private tracerProvider: BasicTracerProvider | null = null;
  private tracer: api.Tracer | null = null;
  private exporter: ZipkinExporter | null = null;
  private isDisposed = false;

  private spans = new Map<string, api.Span>();

  constructor(config: BSBObservableConstructor<InstanceType<typeof Config>>) {
    super(config);
  }

  public async init(): Promise<void> {
    const resource = new Resource({
      [ATTR_SERVICE_NAME]: this.config.serviceName,
      ...(this.config.serviceVersion && { [ATTR_SERVICE_VERSION]: this.config.serviceVersion }),
      ...this.config.resourceAttributes,
    });

    this.exporter = new ZipkinExporter({
      url: this.config.zipkin.url,
      headers: this.config.zipkin.headers,
      statusCodeTagName: this.config.zipkin.statusCodeTagName,
      statusDescriptionTagName: this.config.zipkin.statusDescriptionTagName,
    });

    this.tracerProvider = new BasicTracerProvider({
      resource,
    });

    this.tracerProvider.addSpanProcessor(
      new BatchSpanProcessor(this.exporter, {
        maxQueueSize: this.config.export.maxQueueSize,
        maxExportBatchSize: this.config.export.maxBatchSize,
        scheduledDelayMillis: this.config.export.scheduledDelayMillis,
      })
    );

    this.tracerProvider.register();

    this.tracer = this.tracerProvider.getTracer(
      this.config.serviceName,
      this.config.serviceVersion
    );
  }

  public async run(): Promise<void> {
    // No runtime setup needed
  }

  /**
   * Convert BSB DTrace to OpenTelemetry trace context
   */
  private getTraceContext(trace: DTrace): api.Context {
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
   * Console logging fallback (Zipkin doesn't handle logs)
   */
  private writeConsoleLog(
    level: string,
    trace: DTrace,
    pluginName: string,
    message: string,
    meta?: LogMeta<any>
  ): void {
    if (!this.config.console.enabled) {
      return;
    }

    const formattedMessage = this.logFormatter.formatLog(trace, message, meta);
    const timestamp = new Date().toISOString();
    const logLine = `${timestamp} [${level.toUpperCase()}] [${pluginName}] ${formattedMessage}`;

    const levelMap = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    } as const;

    const currentLevel = levelMap[this.config.console.logLevel as keyof typeof levelMap] ?? 1;
    const messageLevel = levelMap[level.toLowerCase() as keyof typeof levelMap] ?? 1;

    if (messageLevel < currentLevel) {
      return;
    }

    type ConsoleMethod = typeof console.debug | typeof console.log | typeof console.warn | typeof console.error;
    let func: ConsoleMethod = console.log;

    switch (level.toLowerCase()) {
      case 'debug':
        func = console.debug;
        break;
      case 'info':
        func = console.log;
        break;
      case 'warn':
        func = console.warn;
        break;
      case 'error':
        func = console.error;
        break;
    }

    func(logLine);
  }

  // Logging methods (fallback to console - Zipkin is trace-only)
  public debug(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void {
    if (this.mode === "production") {
      return;
    }
    this.writeConsoleLog("debug", trace, pluginName, message, meta);
  }

  public info(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void {
    this.writeConsoleLog("info", trace, pluginName, message, meta);
  }

  public warn(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void {
    this.writeConsoleLog("warn", trace, pluginName, message, meta);
  }

  public error(trace: DTrace, pluginName: string, message: string | BSBError<any>, meta?: LogMeta<any>): void {
    if (message instanceof BSBError) {
      if (message.raw !== null) {
        this.writeConsoleLog("error", message.raw.trace, pluginName, message.raw.message, message.raw.meta);
      } else {
        this.writeConsoleLog("error", trace, pluginName, message.message);
      }
    } else {
      this.writeConsoleLog("error", trace, pluginName, message, meta);
    }
  }

  // Metrics methods (no-op - Zipkin is trace-only)
  public createCounter(): void {
    // Zipkin doesn't support metrics
  }

  public incrementCounter(): void {
    // Zipkin doesn't support metrics
  }

  public createGauge(): void {
    // Zipkin doesn't support metrics
  }

  public setGauge(): void {
    // Zipkin doesn't support metrics
  }

  public createHistogram(): void {
    // Zipkin doesn't support metrics
  }

  public observeHistogram(): void {
    // Zipkin doesn't support metrics
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
          "bsb.trace.t": trace.t,
          "bsb.trace.s": trace.s,
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

    for (const span of this.spans.values()) {
      span.end();
    }
    this.spans.clear();

    if (this.tracerProvider) {
      await this.tracerProvider.shutdown();
      this.tracerProvider = null;
    }

    this.tracer = null;
    this.exporter = null;
  }
}
