# Observable-Default In Production

`observable-default` is intentionally lightweight. It is good for local and baseline runtime logs, but it is not a full external observability backend.

## Behavior

- Console output only
- Trace metadata formatting
- Debug logs suppressed in production mode
- No external transport, retention, or aggregation

## Recommended Migration Path

For production-grade operations, switch to one of:

- `observable-pino`
- `observable-winston`
- `observable-opentelemetry`
- `observable-graylog`
- `syslog`

## Quick Swap Example

```yaml
default:
  observable:
    observable-pino:
      plugin: observable-pino
      package: "@bsb/observable-pino"
      enabled: true
      config:
        level: info
```

## Why Replace

- Centralized log search
- Long-term retention
- Distributed trace export
- Metrics dashboards/alerts
