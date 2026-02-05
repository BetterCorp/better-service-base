# Overview

File logging observable plugin for BSB with automatic rotation, compression, and retention management. This plugin enables persistent log storage with intelligent file management to prevent disk space issues.

## Key Features

- Rotating file streams with size and time-based rotation
- Automatic gzip compression of rotated log files
- Retention management to automatically delete old log files
- Flexible formatting with JSON or plain text output
- Date-based filenames with customizable patterns
- Level filtering to control which log levels are written

## When to Use

Use this plugin when you need:

- Persistent log storage for audit trails or debugging
- Log retention policies for compliance requirements
- Local log access without external dependencies
- Development environments with file-based log analysis

### Production Considerations

For production environments with multiple services, consider combining this plugin with centralized logging solutions like Graylog or OpenTelemetry for better log aggregation and search capabilities.

---

# Installation

```bash
npm install @bsb/observable-logging-file
```

# Configuration

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

## Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `directory` | Base directory for log files | `./logs` |
| `filename` | Filename pattern (use %DATE% for date substitution) | `application.log` |
| `dateFormat` | Date format for filename | `YYYY-MM-DD` |
| `rotation.maxSize` | Maximum file size before rotation (e.g., "10M", "100K") | `10M` |
| `rotation.maxFiles` | Number of old log files to keep | `7` |
| `rotation.interval` | Time-based rotation ("daily", "hourly", "none") | `daily` |
| `rotation.compress` | Gzip rotated files | `true` |
| `levels` | Enable/disable specific log levels | All enabled |
| `format` | Timestamp, trace info, and pretty print options | - |

# Usage

Once configured, the plugin automatically subscribes to all log events from your BSB services. No additional code is required in your services - simply use the standard BSB logging interface:

```typescript
import { BSBService, BSBServiceConstructor } from "@bsb/base";

export class MyService extends BSBService {
  constructor(context: BSBServiceConstructor) {
    super(context);
  }

  async init(): Promise<void> {
    // Logs will automatically be written to file
    this.log.info("Service initialized");
    this.log.debug("Debug information", { details: "..." });
  }
}
```

## Log Rotation Example

With the default configuration, logs will be organized as:

```text
logs/
  application-2026-02-04.log       (current)
  application-2026-02-03.log.gz    (compressed)
  application-2026-02-02.log.gz
  application-2026-02-01.log.gz
  ...
```
