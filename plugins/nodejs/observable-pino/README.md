# @bsb/observable-pino

Pino observable plugin for BSB providing high-performance JSON logging with minimal overhead.

## Key Features

- High performance with async logging
- Structured JSON output by default
- Pretty printing for development
- Custom transports with Pino's ecosystem
- Built-in serializers for errors and objects
- Automatic sensitive data redaction

## Installation

```bash
npm install @bsb/observable-pino
```

## Configuration

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

### Configuration Options

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

## Usage

Once configured, logs are handled by Pino automatically:

```typescript
this.log.info("Service initialized");
this.log.error("Error occurred", new Error("Something went wrong"));
```

## JSON Output Example

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

## Documentation

Detailed documentation (used by the BSB Registry): `https://github.com/BetterCorp/better-service-base/blob/master/plugins/nodejs/observable-pino/docs/plugin.md`

## Links

- GitHub: `https://github.com/BetterCorp/better-service-base/tree/master/plugins/nodejs/observable-pino`
- BSB Registry (package): `https://io.bsbcode.dev/packages/nodejs/@bsb/observable-pino`

## License

Dual-licensed under AGPL-3.0-only OR Commercial License.
