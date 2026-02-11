# BSB Observable Axiom

Axiom.co integration for the Better Service Base (BSB) framework - unified observability for logs, metrics, and traces.

## Features

- **Unified Observability** - Logs, metrics, and traces in one platform
- **Axiom SDK** - Official `@axiomhq/js` for logs and events
- **OpenTelemetry Traces** - OTLP export to Axiom (native support)
- **Structured Metrics** - Metrics as queryable events
- **Batch Processing** - Efficient batching with configurable flush intervals
- **Full TypeScript Support** - Type-safe configuration and no `any` types

## Installation

```bash
npm install @bsb/observable-axiom
```

## Configuration

Add to your BSB configuration file:

```yaml
plugins:
  observable:
    - observable-axiom

observable-axiom:
  serviceName: my-service
  serviceVersion: 1.0.0

  axiom:
    token: ${AXIOM_TOKEN}           # Your Axiom API token
    dataset: bsb-logs               # Axiom dataset name
    orgId: ${AXIOM_ORG_ID}          # Optional: for Axiom Cloud
    # url: https://axiom.mycompany.com  # Optional: for self-hosted

  enabled:
    logs: true
    metrics: true
    traces: true

  export:
    flushIntervalMs: 5000           # Flush every 5 seconds
    maxBatchSize: 1000              # Max events per batch

  # Optional resource attributes (added to all telemetry)
  resourceAttributes:
    environment: production
    region: us-east-1
    cluster: main
```

## Environment Variables

```bash
export AXIOM_TOKEN="xaat-your-token-here"
export AXIOM_ORG_ID="your-org-id"  # Optional for cloud
export AXIOM_DATASET="bsb-logs"
```

## What Gets Exported

### Logs (to Axiom Dataset)
- Structured JSON with trace context
- Log levels: debug, info, warn, error
- Plugin name and service metadata
- Custom metadata from log calls
- Resource attributes

### Metrics (to Axiom Dataset as Events)
- Counters, gauges, histograms
- Stored as structured events
- Queryable with Axiom Processing Language (APL)
- Automatic timestamp and service tagging

### Traces (to Axiom via OTLP)
- Full distributed tracing
- Span lifecycle (start, end, error)
- Trace context propagation
- Exception tracking

## Usage

The plugin automatically integrates with BSB's Observable pattern:

```typescript
export class MyService extends BSBService<InstanceType<typeof Config>, typeof EventSchemas> {
  static Config = Config;
  static EventSchemas = EventSchemas;

  public async run(obs: Observable) {
    // Logs automatically sent to Axiom
    obs.log.info("Service started", { userId: 123 });

    // Create child span (sent to Axiom traces)
    const workObs = obs.span("process-request");
    workObs.setAttribute("request.id", "req-123");

    try {
      await this.processRequest();
      workObs.end();
    } catch (error) {
      workObs.recordException(error);
      workObs.end();
    }

    // Metrics also sent to Axiom
    // (BSB metrics API will emit these as events)
  }
}
```

## Axiom Setup

### 1. Create Account
Sign up at https://axiom.co

### 2. Create Dataset
```bash
axiom dataset create bsb-logs
```

### 3. Create API Token
```bash
axiom token create bsb-ingest --scopes ingest --datasets bsb-logs
```

### 4. Configure BSB
Add token to your configuration or environment variables.

## Querying Data in Axiom

### Logs Query (APL)
```apl
['bsb-logs']
| where service == "my-service"
| where level == "error"
| order by _time desc
| limit 100
```

### Metrics Query
```apl
['bsb-logs']
| where metric_type == "counter"
| where metric_name == "requests_total"
| summarize sum(value) by bin(_time, 1m)
```

### Trace Analysis
Use Axiom's Trace view to explore distributed traces with automatic service maps and performance analytics.

## Architecture

```
BSB Application
    ↓
Observable (DTrace)
    ↓
observable-axiom
    ├── Logs/Metrics → Axiom SDK → Axiom Dataset
    └── Traces → OTLP Exporter → Axiom Traces
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `serviceName` | string | `"bsb-service"` | Service identifier |
| `serviceVersion` | string | - | Service version tag |
| `axiom.token` | string | **required** | Axiom API token |
| `axiom.dataset` | string | `"bsb-logs"` | Dataset name |
| `axiom.orgId` | string | - | Organization ID (cloud) |
| `axiom.url` | string | - | Custom URL (self-hosted) |
| `enabled.logs` | boolean | `true` | Enable log export |
| `enabled.metrics` | boolean | `true` | Enable metrics export |
| `enabled.traces` | boolean | `true` | Enable trace export |
| `export.flushIntervalMs` | number | `5000` | Flush interval (ms) |
| `export.maxBatchSize` | number | `1000` | Max events per batch |
| `resourceAttributes` | object | `{}` | Custom attributes |

## Comparison with Other Observability Plugins

| Plugin | Logs | Metrics | Traces | Backend |
|--------|------|---------|--------|---------|
| observable-axiom | ✅ | ✅ | ✅ | Axiom.co |
| observable-opentelemetry | ✅ | ✅ | ✅ | OTLP Collector |
| observable-zipkin | Console | ❌ | ✅ | Zipkin |
| observable-default | Console | ❌ | ❌ | - |

## Best Practices

### 1. Use Datasets Strategically
```yaml
# Production
axiom:
  dataset: prod-logs

# Development
axiom:
  dataset: dev-logs
```

### 2. Set Resource Attributes
```yaml
resourceAttributes:
  environment: ${ENVIRONMENT}
  deployment: ${DEPLOYMENT_ID}
  datacenter: ${DATACENTER}
```

### 3. Control Batch Size
```yaml
export:
  # High-volume services
  flushIntervalMs: 1000
  maxBatchSize: 5000

  # Low-volume services
  flushIntervalMs: 10000
  maxBatchSize: 100
```

### 4. Use Structured Logging
```typescript
// Good - queryable fields
obs.log.info("User logged in", {
  userId: user.id,
  email: user.email
});

// Bad - unstructured
obs.log.info(`User ${user.email} logged in`);
```

## Axiom Features

- **APL (Axiom Processing Language)** - Powerful query language
- **Service Maps** - Automatic trace visualization
- **Monitors & Alerts** - Real-time alerting on anomalies
- **Dashboards** - Custom visualizations
- **Notebooks** - Collaborative analysis
- **Retention** - Configurable data retention policies

## License

AGPL-3.0 - See LICENSE file for details.

Commercial licenses available at https://www.bettercorp.dev
