# @bsb/observable-logging-file

File logging observable plugin for BSB with automatic rotation, compression, and retention management.

## Key Features

- Rotating file streams with size and time-based rotation
- Automatic gzip compression of rotated log files
- Retention management to delete old log files
- Flexible formatting with JSON or plain text output
- Date-based filenames with customizable patterns
- Level filtering for log output control

## Installation

```bash
npm install @bsb/observable-logging-file
```

## Configuration

Add the plugin to your BSB configuration file:

```yaml
plugins:
  observables:
    - plugin: "@bsb/observable-logging-file"
      enabled: true
      config:
        directory: "./logs"
        filename: "application-%DATE%.log"
        dateFormat: "YYYY-MM-DD"
        rotation:
          maxSize: "10M"
          maxFiles: 7
          interval: "daily"
          compress: true
        levels:
          debug: true
          info: true
          warn: true
          error: true
        format:
          timestamp: true
          traceInfo: true
          prettyPrint: false
```

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `directory` | Base directory for log files | `./logs` |
| `filename` | Filename pattern (use `%DATE%` for date substitution) | `application.log` |
| `dateFormat` | Date format for filename | `YYYY-MM-DD` |
| `rotation.maxSize` | Maximum file size before rotation | `10M` |
| `rotation.maxFiles` | Number of old log files to keep | `7` |
| `rotation.interval` | Time-based rotation: `daily`, `hourly`, `none` | `daily` |
| `rotation.compress` | Gzip rotated files | `true` |
| `levels` | Enable or disable specific log levels | All enabled |
| `format` | Timestamp, trace info, and pretty print options | - |

## Usage

Once configured, logs are automatically written to files:

```typescript
this.log.info("Service initialized");
this.log.debug("Debug information", { details: "..." });
```

## Log Rotation Example

```text
logs/
  application-2026-02-04.log
  application-2026-02-03.log.gz
  application-2026-02-02.log.gz
```

## Documentation

Detailed documentation (used by the BSB Registry): `https://github.com/BetterCorp/better-service-base/blob/master/plugins/nodejs/observable-logging-file/docs/plugin.md`

## Links

- GitHub: `https://github.com/BetterCorp/better-service-base/tree/master/plugins/nodejs/observable-logging-file`
- BSB Registry (package): `https://io.bsbcode.dev/packages/nodejs/@bsb/observable-logging-file`

## License

Dual-licensed under AGPL-3.0-only OR Commercial License.
