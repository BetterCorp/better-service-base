# @bsb/observable-zipkin

Zipkin tracing integration for BSB. Exports distributed traces to Zipkin and provides optional console logging.

## Key Features

- Zipkin v2 API export
- OpenTelemetry-based tracing
- Configurable sampling and batching
- Optional console logging for non-trace output

## Installation

```bash
npm install @bsb/observable-zipkin
```

## Configuration

Add the plugin to your BSB configuration file:

```yaml
plugins:
  observables:
    - plugin: "@bsb/observable-zipkin"
      enabled: true
      config:
        serviceName: "my-service"
        serviceVersion: "1.0.0"
        zipkin:
          url: "http://localhost:9411/api/v2/spans"
          # headers:
          #   Authorization: "Bearer token123"
        export:
          maxBatchSize: 100
          maxQueueSize: 2048
          scheduledDelayMillis: 5000
        samplingRate: 1.0
        console:
          enabled: true
          logLevel: "info"
        resourceAttributes:
          environment: "production"
          region: "us-east-1"
```

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `serviceName` | Service identifier | `"bsb-service"` |
| `serviceVersion` | Service version tag | - |
| `zipkin.url` | Zipkin API endpoint | `"http://localhost:9411/api/v2/spans"` |
| `zipkin.headers` | Custom HTTP headers | - |
| `export.maxBatchSize` | Max spans per batch | `100` |
| `export.maxQueueSize` | Max queued spans | `2048` |
| `export.scheduledDelayMillis` | Flush interval (ms) | `5000` |
| `samplingRate` | Sampling probability (0-1) | `1.0` |
| `console.enabled` | Enable console logs | `true` |
| `console.logLevel` | Minimum log level | `"info"` |
| `resourceAttributes` | Custom attributes | `{}` |

## Usage

Once configured, traces are exported automatically:

```typescript
this.log.info("Service started");
const workObs = this.obs.span("heavy-work");
await this.doWork();
workObs.end();
```

## Zipkin Setup

Run Zipkin locally:

```bash
docker run -d -p 9411:9411 openzipkin/zipkin
```

## Documentation

Detailed documentation (used by the BSB Registry): `https://github.com/BetterCorp/better-service-base/blob/master/plugins/nodejs/observable-zipkin/docs/plugin.md`

## Links

- GitHub: `https://github.com/BetterCorp/better-service-base/tree/master/plugins/nodejs/observable-zipkin`
- BSB Registry (package): `https://io.bsbcode.dev/packages/nodejs/@bsb/observable-zipkin`

## License

(AGPL-3.0-only OR Commercial)
