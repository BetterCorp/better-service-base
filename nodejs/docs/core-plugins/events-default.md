# events-default

`events-default` is the built-in in-process events plugin for BSB.

It handles plugin-to-plugin communication inside a single runtime.

## What It Supports

- Fire-and-forget events
- Returnable events (request/response)
- Broadcast events
- Stream relay support

## Minimal Example

```yaml
default:
  events:
    events-default:
      plugin: events-default
      enabled: true
```

## Operational Characteristics

- In-memory only
- No cross-container message routing
- No broker-backed durability/replay

## When To Replace

Replace with a distributed events backend when you run multiple BSB instances or need durable messaging.
