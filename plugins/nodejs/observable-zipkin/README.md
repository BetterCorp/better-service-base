# BSB Observable Zipkin

Zipkin tracing integration for the Better Service Base (BSB) framework.

## Features

- Direct Zipkin v2 API integration
- Distributed tracing with OpenTelemetry instrumentation
- Configurable sampling rates
- Batch span export with configurable flush intervals
- Console logging fallback for non-trace observability
- Full TypeScript support

## Installation

```bash
npm install @bsb/observable-zipkin
```

## Configuration

Add to your BSB configuration file:

```yaml
plugins:
  observable:
    - observable-zipkin

observable-zipkin:
  serviceName: my-service
  serviceVersion: 1.0.0

  zipkin:
    url: http://localhost:9411/api/v2/spans
    # Optional custom headers for authentication
    # headers:
    #   Authorization: Bearer token123

  export:
    maxBatchSize: 100
    maxQueueSize: 2048
    scheduledDelayMillis: 5000

  samplingRate: 1.0  # 1.0 = 100%, 0.5 = 50%

  # Console logging (Zipkin doesn't handle logs/metrics)
  console:
    enabled: true
    logLevel: info  # debug | info | warn | error

  # Optional resource attributes
  resourceAttributes:
    environment: production
    region: us-east-1
```

## What Gets Exported

### Traces (to Zipkin)
- All span lifecycle events (start, end, error)
- Span attributes and context
- Distributed trace propagation
- Exception tracking

### Logs (to Console)
- Debug, info, warn, error levels
- Structured logging with trace context
- Configurable log level filtering

### Metrics (No-op)
- Zipkin is trace-only, no metrics support
- Use `observable-opentelemetry` or `observable-prometheus` for metrics

## Usage

The plugin automatically integrates with BSB's Observable pattern:

```typescript
export class MyService extends BSBService<InstanceType<typeof Config>, typeof EventSchemas> {
  static Config = Config;
  static EventSchemas = EventSchemas;

  public async run(obs: Observable) {
    // Traces automatically sent to Zipkin
    obs.log.info("Service started");  // Console log

    // Create child span
    const workObs = obs.span("heavy-work");
    workObs.setAttribute("work.type", "batch");

    try {
      await this.doWork();
      workObs.end();
    } catch (error) {
      workObs.recordException(error);
      workObs.end();
    }
  }
}
```

## Zipkin Setup

Run Zipkin locally with Docker:

```bash
docker run -d -p 9411:9411 openzipkin/zipkin
```

Access UI at: http://localhost:9411

## Architecture

```
BSB Application
    ↓
Observable (DTrace)
    ↓
observable-zipkin
    ↓
OpenTelemetry SDK
    ↓
Zipkin Exporter
    ↓
Zipkin Server (HTTP)
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `serviceName` | string | `"bsb-service"` | Service identifier in Zipkin |
| `serviceVersion` | string | - | Service version tag |
| `zipkin.url` | string | `"http://localhost:9411/api/v2/spans"` | Zipkin API endpoint |
| `zipkin.headers` | object | - | Custom HTTP headers |
| `export.maxBatchSize` | number | `100` | Max spans per batch |
| `export.maxQueueSize` | number | `2048` | Max queued spans |
| `export.scheduledDelayMillis` | number | `5000` | Flush interval (ms) |
| `samplingRate` | number | `1.0` | Sampling probability (0-1) |
| `console.enabled` | boolean | `true` | Enable console logs |
| `console.logLevel` | string | `"info"` | Minimum log level |

## Comparison with Other Observability Plugins

| Plugin | Traces | Metrics | Logs | Backend |
|--------|--------|---------|------|---------|
| observable-zipkin | ✅ | ❌ | Console | Zipkin |
| observable-opentelemetry | ✅ | ✅ | ✅ | OTLP Collector |
| observable-default | ❌ | ❌ | Console | - |

## License

AGPL-3.0 - See LICENSE file for details.

Commercial licenses available at https://www.bettercorp.dev
