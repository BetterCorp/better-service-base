# Overview

Graylog (GELF) observable plugin for BSB that sends logs to Graylog servers using the Graylog Extended Log Format (GELF) protocol. This plugin enables centralized log management with powerful search and analysis capabilities.

## Key Features

- GELF 1.1 protocol with full specification support
- Multiple transports: UDP, TCP, and HTTP
- Custom fields with automatic trace and span integration
- Optional gzip compression for reduced bandwidth
- Level filtering to control which logs are sent

## When to Use

Use this plugin when you need:

- Centralized log management with Graylog
- Powerful log search and filtering capabilities
- Real-time log analysis and alerting
- Log retention with archive capabilities

### About Graylog

Graylog is a leading centralized log management platform that provides powerful search, analysis, and alerting capabilities. It supports the GELF protocol for efficient structured log ingestion.

---

# Installation

```bash
npm install @bsb/observable-graylog
```

# Configuration

Add the plugin to your BSB configuration file:

```yaml
plugins:
  observables:
    - plugin: "@bsb/observable-graylog"
      enabled: true
      config:
        host: "localhost"
        port: 12201
        protocol: "udp"
        facility: "bsb"
        compress: true
        additionalFields:
          environment: "production"
          datacenter: "us-east-1"
        levels:
          debug: true
          info: true
          warn: true
          error: true
```

## Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `host` | Graylog server hostname | `localhost` |
| `port` | Graylog GELF input port | `12201` |
| `protocol` | Transport protocol: "udp", "tcp", or "http" | `udp` |
| `httpEndpoint` | HTTP endpoint URL (for HTTP protocol) | - |
| `facility` | Facility name for log categorization | `bsb` |
| `additionalFields` | Custom fields included in all messages | `{}` |
| `compress` | Enable gzip compression | `true` |
| `levels` | Log level filtering | All enabled |

# Usage

Once configured, the plugin automatically sends logs to Graylog. No additional code is required in your services:

```typescript
import { BSBService, BSBServiceConstructor } from "@bsb/base";

export class MyService extends BSBService {
  constructor(context: BSBServiceConstructor) {
    super(context);
  }

  async init(): Promise<void> {
    // Logs are automatically sent to Graylog with trace context
    this.log.info("Service initialized");
    this.log.error("Failed to connect", new Error("Connection timeout"));
  }
}
```

## Graylog Setup

Create a GELF input in Graylog to receive logs:

1. Navigate to **System → Inputs**
2. Select **GELF UDP/TCP/HTTP** from the dropdown
3. Click **Launch new input**
4. Configure the port (default: 12201)
5. Save the input
