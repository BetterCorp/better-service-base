# @bsb/observable-winston

Winston observable plugin for BSB - integrate with the popular Winston logging framework.

## Installation

```bash
npm install @bsb/observable-winston
```

## Features

- **Winston integration** - Full Winston ecosystem support
- **Multiple transports** - Console, file, daily-rotate-file
- **Flexible formatting** - JSON, pretty-print, or simple text
- **Child loggers** - Per-plugin Winston loggers
- **Error serialization** - Proper error stack trace handling

## Configuration

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

- **level**: Minimum log level ("error", "warn", "info", "debug")
- **transports.console**: Console output settings
- **transports.file**: Standard file output
- **transports.dailyRotate**: Daily rotating files with retention
- **format**: Timestamp, JSON, and pretty-print options

## License

Dual-licensed under AGPL-3.0-only OR Commercial License.
