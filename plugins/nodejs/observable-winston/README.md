# @bsb/observable-winston

Winston observable plugin for BSB that integrates with the Winston logging framework.

## Key Features

- Full Winston ecosystem support with child loggers
- Multiple transports: console, file, daily-rotate-file
- Flexible formatting: JSON, pretty-print, or simple text
- Per-plugin child loggers for isolated logging
- Proper error serialization with stack traces

## Installation

```bash
npm install @bsb/observable-winston
```

## Configuration

Add the plugin to your BSB configuration file:

```yaml
plugins:
  observables:
    - plugin: "@bsb/observable-winston"
      enabled: true
      config:
        level: "info"
        transports:
          console:
            enabled: true
            colorize: true
          file:
            enabled: false
            filename: "./logs/application.log"
            maxsize: 10485760
            maxFiles: 5
            tailable: true
          dailyRotate:
            enabled: true
            dirname: "./logs"
            filename: "application-%DATE%.log"
            datePattern: "YYYY-MM-DD"
            maxSize: "20m"
            maxFiles: "14d"
            zippedArchive: true
        format:
          timestamp: true
          json: true
          prettyPrint: false
```

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `level` | Minimum log level: `error`, `warn`, `info`, `debug` | `info` |
| `transports.console` | Console output settings | Enabled |
| `transports.file` | Standard file output with size-based rotation | Disabled |
| `transports.dailyRotate` | Daily rotating files with retention | Disabled |
| `format.timestamp` | Include timestamps in logs | `true` |
| `format.json` | Output in JSON format | `true` |
| `format.prettyPrint` | Pretty-print JSON output | `false` |

## Usage

Once configured, logs are handled by Winston automatically:

```typescript
this.log.info("Service initialized");
this.log.error("Error occurred", new Error("Something went wrong"));
```

## Daily Rotation Output

```text
logs/
  application-2026-02-04.log
  application-2026-02-03.log.gz
  application-2026-02-02.log.gz
```

## Documentation

Detailed documentation (used by the BSB Registry): `https://github.com/BetterCorp/better-service-base/blob/master/plugins/nodejs/observable-winston/docs/plugin.md`

## Links

- GitHub: `https://github.com/BetterCorp/better-service-base/tree/master/plugins/nodejs/observable-winston`
- BSB Registry (package): `https://io.bsbcode.dev/packages/nodejs/@bsb/observable-winston`

## License

Dual-licensed under AGPL-3.0-only OR Commercial License.
