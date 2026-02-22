# observable-default

`observable-default` is the built-in observable plugin for BSB.

It provides baseline logging and trace-aware output to stdout/stderr.

## What It Provides

- Debug/info/warn/error logging
- Trace-aware message formatting
- Lightweight diagnostics for development

## Minimal Example

```yaml
default:
  observable:
    observable-default:
      plugin: observable-default
      enabled: true
      config: {}
```

## Behavior Notes

- Debug logs are typically suppressed in production mode
- Output is console-based (no external collector by default)
- No plugin-specific config fields are required for `observable-default`

## When To Replace

Use a dedicated observable plugin (`observable-pino`, `observable-winston`, `observable-opentelemetry`, `observable-graylog`, `syslog`) when you need centralized logs, metrics, and tracing pipelines.
