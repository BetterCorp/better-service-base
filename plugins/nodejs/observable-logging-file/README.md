# @bsb/observable-logging-file

File logging observable plugin for BSB (Better-Service-Base) with automatic rotation, compression, and retention management.

## Installation

```bash
npm install @bsb/observable-logging-file
```

## Features

- **Rotating file streams** - Automatic rotation based on file size or time intervals
- **Compression** - Gzip compression of rotated log files
- **Retention management** - Automatically delete old log files
- **Flexible formatting** - JSON or plain text output with customizable timestamps
- **Date-based filenames** - Support for date patterns in filenames
- **Level filtering** - Control which log levels are written to files

## Configuration

Add the plugin to your BSB configuration:

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

- **directory**: Base directory for log files
- **filename**: Filename pattern (use %DATE% for date substitution)
- **dateFormat**: Date format for filename
- **rotation.maxSize**: Maximum file size before rotation (e.g., "10M", "100K")
- **rotation.maxFiles**: Number of old log files to keep
- **rotation.interval**: Time-based rotation ("daily", "hourly", "none")
- **rotation.compress**: Gzip rotated files
- **levels**: Enable/disable specific log levels
- **format**: Timestamp, trace info, and pretty print options

## License

Dual-licensed under AGPL-3.0-only OR Commercial License.
