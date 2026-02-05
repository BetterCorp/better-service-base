# Overview

OpenTelemetry observable plugin for BSB with full OTLP (OpenTelemetry Protocol) export support. This plugin enables complete observability by exporting traces, metrics, and logs to any OpenTelemetry-compatible backend.

## Key Features

- Full OpenTelemetry integration for traces, metrics, and logs
- OTLP export over HTTP and gRPC protocols
- Customizable resource attributes for service metadata
- Configurable sampling to control trace collection rates
- Efficient batch processing for data export

## When to Use

Use this plugin when you need:

- Distributed tracing across microservices
- Integration with OpenTelemetry-compatible platforms (Jaeger, Zipkin, New Relic, Datadog)
- Unified observability with traces, metrics, and logs
- Industry-standard telemetry with vendor-neutral instrumentation

### OpenTelemetry Ecosystem

OpenTelemetry is the industry standard for observability. It provides vendor-neutral APIs and tools for collecting distributed traces, metrics, and logs. This plugin integrates BSB seamlessly with the OpenTelemetry ecosystem.

---

# Installation

```bash
npm install @bsb/observable-opentelemetry
```

# Configuration

Add the plugin to your BSB configuration file:

```yaml
plugins:
  observables:
    - plugin: "@bsb/observable-opentelemetry"
      enabled: true
      config:
        serviceName: "my-service"
        serviceVersion: "1.0.0"
        endpoint: "http://localhost:4318"
        export:
          protocol: "http"
          interval: 5000
          maxBatchSize: 512
        enabled:
          traces: true
          metrics: true
          logs: true
        resourceAttributes:
          environment: "production"
          region: "us-east-1"
        samplingRate: 1.0
```

## Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `serviceName` | Name of your service | - |
| `serviceVersion` | Version of your service | - |
| `endpoint` | OTLP collector endpoint URL | `http://localhost:4318` |
| `export.protocol` | Export protocol: "http" or "grpc" | `http` |
| `export.interval` | Export interval in milliseconds | `5000` |
| `export.maxBatchSize` | Maximum batch size for exports | `512` |
| `enabled` | Toggle traces, metrics, and logs individually | All enabled |
| `resourceAttributes` | Custom resource attributes (key-value pairs) | `{}` |
| `samplingRate` | Trace sampling rate (0.0 to 1.0) | `1.0` |

# Usage

Once configured, the plugin automatically exports telemetry data from your BSB services. No additional code is required - simply use the standard BSB logging and metrics interfaces:

```typescript
import { BSBService, BSBServiceConstructor } from "@bsb/base";

export class MyService extends BSBService {
  constructor(context: BSBServiceConstructor) {
    super(context);
  }

  async init(): Promise<void> {
    // Logs are automatically exported with trace context
    this.log.info("Service initialized");

    // Traces are automatically propagated across service boundaries
    await this.events.emitEvent("user.created", { userId: "123" });
  }
}
```

## OpenTelemetry Collector Setup

To receive telemetry data, you'll need an OpenTelemetry Collector or compatible backend:

```yaml
# docker-compose.yml
version: '3'
services:
  otel-collector:
    image: otel/opentelemetry-collector:latest
    ports:
      - "4318:4318"  # OTLP HTTP
      - "4317:4317"  # OTLP gRPC
    volumes:
      - ./otel-config.yaml:/etc/otel-config.yaml
    command: ["--config=/etc/otel-config.yaml"]
```
