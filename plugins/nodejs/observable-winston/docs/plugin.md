# Overview

Winston observable plugin for BSB that integrates with the popular Winston logging framework. This plugin enables flexible logging with multiple transports and the full Winston ecosystem.

## Key Features

- Full Winston ecosystem support with child loggers
- Multiple transports: console, file, daily-rotate-file
- Flexible formatting: JSON, pretty-print, or simple text
- Per-plugin child loggers for isolated logging
- Proper error serialization with stack traces

## When to Use

Use this plugin when you need:

- Winston's extensive transport ecosystem
- Advanced formatting and filtering capabilities
- Integration with existing Winston-based infrastructure
- Custom transports for specialized destinations

### About Winston

Winston is the most popular logging library for Node.js, known for its flexibility and extensive transport ecosystem. This plugin integrates BSB seamlessly with Winston, giving you access to all Winston features.

---

# Installation

```bash
npm install @bsb/observable-winston
```

# Configuration

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

## Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `level` | Minimum log level: "error", "warn", "info", "debug" | `info` |
| `transports.console` | Console output settings | Enabled |
| `transports.file` | Standard file output with size-based rotation | Disabled |
| `transports.dailyRotate` | Daily rotating files with retention | Disabled |
| `format.timestamp` | Include timestamps in logs | `true` |
| `format.json` | Output in JSON format | `true` |
| `format.prettyPrint` | Pretty-print JSON output | `false` |

# Usage

Once configured, the plugin automatically integrates with BSB's logging system. No additional code is required:

```typescript
import { BSBService, BSBServiceConstructor } from "@bsb/base";

export class MyService extends BSBService {
  constructor(context: BSBServiceConstructor) {
    super(context);
  }

  async init(): Promise<void> {
    // Logs are automatically handled by Winston
    this.log.info("Service initialized");
    this.log.error("Error occurred", new Error("Something went wrong"));
  }
}
```

## Daily Rotation Output

With daily rotation enabled, logs will be organized as:

```text
logs/
  application-2026-02-04.log       (current)
  application-2026-02-03.log.gz    (compressed)
  application-2026-02-02.log.gz
  ...
```
