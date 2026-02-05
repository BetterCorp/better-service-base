# @bsb/observable-opentelemetry

OpenTelemetry observable plugin for BSB with full OTLP export support for traces, metrics, and logs.

## Installation

```bash
npm install @bsb/observable-opentelemetry
```

## Features

- **Full OpenTelemetry integration** - Traces, metrics, and logs
- **OTLP export** - HTTP and gRPC protocol support
- **Resource attributes** - Customizable service metadata
- **Configurable sampling** - Control trace collection rates
- **Batch processing** - Efficient data export with batching

## Configuration

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

### Configuration Options

- **serviceName**: Name of your service
- **serviceVersion**: Version of your service
- **endpoint**: OTLP collector endpoint URL
- **export.protocol**: "http" or "grpc"
- **export.interval**: Export interval in milliseconds
- **export.maxBatchSize**: Maximum batch size for exports
- **enabled**: Toggle traces, metrics, and logs individually
- **resourceAttributes**: Custom resource attributes
- **samplingRate**: Trace sampling rate (0.0 to 1.0)

## License

Dual-licensed under AGPL-3.0-only OR Commercial License.
