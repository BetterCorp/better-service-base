# Overview

Pino observable plugin for BSB providing high-performance JSON logging with minimal overhead. Pino is designed for speed, using asynchronous logging to minimize impact on application performance.

## Key Features

- High performance with async logging and minimal overhead
- Structured JSON output by default
- Pretty printing for human-readable development output
- Custom transports with Pino's transport ecosystem
- Built-in serializers for errors and objects
- Automatic sensitive data redaction

## When to Use

Use this plugin when you need:

- Maximum logging performance with minimal overhead
- Structured JSON logging for parsing and analysis
- High-throughput applications where logging must be fast
- Sensitive data redaction capabilities

### About Pino

Pino is one of the fastest Node.js loggers, designed for minimal performance impact. It achieves high performance through asynchronous logging and efficient JSON serialization, making it ideal for production applications.

---

# Installation

```bash
npm install @bsb/observable-pino
```

# Configuration

Add the plugin to your BSB configuration file:

```yaml
plugins:
  observables:
    - plugin: "@bsb/observable-pino"
      enabled: true
      config:
        level: "info"
        prettyPrint:
          enabled: false
          colorize: true
          translateTime: "SYS:standard"
          ignore: "pid,hostname"
        transport:
          enabled: false
          target: "pino/file"
          options:
            destination: "./logs/app.log"
        serializers:
          error: true
        base:
          app: "my-service"
        redact:
          - "password"
          - "token"
          - "apiKey"
```

## Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `level` | Minimum log level | `info` |
| `prettyPrint.enabled` | Enable development-friendly formatting | `false` |
| `prettyPrint.colorize` | Colorize pretty output | `true` |
| `prettyPrint.translateTime` | Human-readable timestamps | `SYS:standard` |
| `transport` | Custom Pino transport configuration | Disabled |
| `serializers.error` | Enable error/object serialization | `true` |
| `base` | Default fields included in all logs | `{}` |
| `redact` | Array of field paths to redact | `[]` |

# Usage

Once configured, the plugin automatically integrates with BSB's logging system. No additional code is required:

```typescript
import { BSBService, BSBServiceConstructor } from "@bsb/base";

export class MyService extends BSBService {
  constructor(context: BSBServiceConstructor) {
    super(context);
  }

  async init(): Promise<void> {
    // Logs are automatically handled by Pino
    this.log.info("Service initialized");
    this.log.error("Error occurred", new Error("Something went wrong"));

    // Sensitive data will be redacted
    this.log.debug("User login", {
      username: "john",
      password: "secret123" // This will be redacted
    });
  }
}
```

## JSON Output Example

Pino outputs structured JSON by default:

```json
{
  "level": 30,
  "time": 1706984400000,
  "app": "my-service",
  "msg": "Service initialized",
  "traceId": "abc123",
  "spanId": "def456"
}
```

## Pretty Print for Development

Enable pretty print for human-readable output during development:

```text
[1706984400000] INFO (my-service): Service initialized
    traceId: "abc123"
    spanId: "def456"
```
