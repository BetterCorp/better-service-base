# @bsb/observable-opentelemetry

OpenTelemetry observable plugin for BSB with full OTLP export support for traces, metrics, and logs.

## Key Features

- Full OpenTelemetry integration for traces, metrics, and logs
- OTLP export over HTTP
- Customizable resource attributes for service metadata
- Configurable sampling to control trace collection rates
- Efficient batch processing for data export

## Installation

```bash
npm install @bsb/observable-opentelemetry
```

## Configuration

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

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `serviceName` | Name of your service | - |
| `serviceVersion` | Version of your service | - |
| `endpoint` | OTLP collector endpoint URL | `http://localhost:4318` |
| `export.protocol` | Export protocol setting; current exporter implementation uses `http` | `http` |
| `export.interval` | Export interval in milliseconds | `5000` |
| `export.maxBatchSize` | Maximum batch size for exports | `512` |
| `enabled` | Toggle traces, metrics, and logs individually | All enabled |
| `resourceAttributes` | Custom resource attributes | `{}` |
| `samplingRate` | Trace sampling rate (0.0 to 1.0) | `1.0` |

## Usage

Once configured, telemetry is automatically exported:

```typescript
this.log.info("Service initialized");
await this.events.emitEvent("user.created", { userId: "123" });
```

## Collector Setup

Example OpenTelemetry Collector service:

```yaml
version: "3"
services:
  otel-collector:
    image: otel/opentelemetry-collector:latest
    ports:
      - "4318:4318"
      - "4317:4317"
```

## Documentation

Detailed documentation (used by the BSB Registry): `https://github.com/BetterCorp/better-service-base/blob/master/plugins/nodejs/observable-opentelemetry/docs/plugin.md`

## Links

- GitHub: `https://github.com/BetterCorp/better-service-base/tree/master/plugins/nodejs/observable-opentelemetry`
- BSB Registry (package): `https://io.bsbcode.dev/packages/nodejs/@bsb/observable-opentelemetry`

## License

Dual-licensed under AGPL-3.0-only OR Commercial License.
