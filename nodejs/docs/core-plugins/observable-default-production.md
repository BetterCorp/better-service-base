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

## Default Plugin Config Example

```yaml
default:
  observable:
    observable-default:
      plugin: observable-default
      enabled: true
      config: {}
```

`observable-default` itself has no required plugin-specific options.

## Why Replace

- Centralized log search
- Long-term retention
- Distributed trace export
- Metrics dashboards/alerts
