# @bsb/observable-axiom

Axiom.co observability integration for BSB. Exports logs, metrics, and traces to Axiom with OTLP tracing support.

## Key Features

- Unified observability: logs, metrics, and traces
- Axiom SDK for logs and events
- OpenTelemetry tracing via OTLP
- Batch processing with configurable flush interval
- Resource attributes for consistent service metadata

## Installation

```bash
npm install @bsb/observable-axiom
```

## Configuration

Add the plugin to your BSB configuration file:

```yaml
plugins:
  observables:
    - plugin: "@bsb/observable-axiom"
      enabled: true
      config:
        serviceName: "my-service"
        serviceVersion: "1.0.0"
        axiom:
          token: "${AXIOM_TOKEN}"
          dataset: "bsb-logs"
          orgId: "${AXIOM_ORG_ID}"
          # url: "https://axiom.mycompany.com" # Optional for self-hosted
        enabled:
          logs: true
          metrics: true
          traces: true
        export:
          flushIntervalMs: 5000
          maxBatchSize: 1000
        resourceAttributes:
          environment: "production"
          region: "us-east-1"
          cluster: "main"
```

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `serviceName` | Service identifier | `"bsb-service"` |
| `serviceVersion` | Service version tag | - |
| `axiom.token` | Axiom API token | Required |
| `axiom.dataset` | Axiom dataset name | `"bsb-logs"` |
| `axiom.orgId` | Organization ID (Axiom Cloud) | - |
| `axiom.url` | Custom Axiom URL (self-hosted) | - |
| `enabled.logs` | Enable log export | `true` |
| `enabled.metrics` | Enable metric export | `true` |
| `enabled.traces` | Enable trace export | `true` |
| `export.flushIntervalMs` | Flush interval (ms) | `5000` |
| `export.maxBatchSize` | Max events per batch | `1000` |
| `resourceAttributes` | Custom attributes | `{}` |

## Environment Variables

```bash
AXIOM_TOKEN="xaat-your-token-here"
AXIOM_ORG_ID="your-org-id"
AXIOM_DATASET="bsb-logs"
```

## Usage

Once configured, logs, metrics, and traces are exported automatically:

```typescript
this.log.info("Service started", { userId: 123 });
const workObs = this.obs.span("process-request");
await this.events.emitEvent("user.created", { userId: "123" });
workObs.end();
```

## Axiom Setup (Quick)

1. Create a dataset
2. Create an ingest token with dataset access
3. Set `AXIOM_TOKEN` and `AXIOM_DATASET` in the environment

## Documentation

Detailed documentation (used by the BSB Registry): `https://github.com/BetterCorp/better-service-base/blob/master/plugins/nodejs/observable-axiom/docs/plugin.md`

## Links

- GitHub: `https://github.com/BetterCorp/better-service-base/tree/master/plugins/nodejs/observable-axiom`
- BSB Registry (package): `https://io.bsbcode.dev/packages/nodejs/@bsb/observable-axiom`

## License

(AGPL-3.0-only OR Commercial)
