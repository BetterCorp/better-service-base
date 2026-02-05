# @bsb/observable-pino

Pino observable plugin for BSB - high-performance JSON logging with minimal overhead.

## Installation

```bash
npm install @bsb/observable-pino
```

## Features

- **High performance** - Async logging with minimal overhead
- **JSON output** - Structured logging by default
- **Pretty printing** - Human-readable development output
- **Custom transports** - Pino transport ecosystem support
- **Serializers** - Built-in error and object serialization
- **Redaction** - Automatic sensitive data redaction

## Configuration

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

### Configuration Options

- **level**: Minimum log level
- **prettyPrint**: Development-friendly formatting
- **transport**: Custom Pino transport configuration
- **serializers**: Enable error/object serialization
- **base**: Default fields included in all logs
- **redact**: Array of field paths to redact

## License

Dual-licensed under AGPL-3.0-only OR Commercial License.
