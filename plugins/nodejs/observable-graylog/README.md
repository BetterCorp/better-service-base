# @bsb/observable-graylog

Graylog (GELF) observable plugin for BSB that sends logs to Graylog servers using the Graylog Extended Log Format (GELF) protocol.

## Key Features

- GELF 1.1 protocol support
- Multiple transports: UDP, TCP, and HTTP
- Custom fields with automatic trace and span integration
- Optional gzip compression
- Level filtering to control which logs are sent

## Installation

```bash
npm install @bsb/observable-graylog
```

## Configuration

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

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `host` | Graylog server hostname | `localhost` |
| `port` | Graylog GELF input port | `12201` |
| `protocol` | Transport protocol: `udp`, `tcp`, `http` | `udp` |
| `httpEndpoint` | HTTP endpoint URL (for HTTP protocol) | - |
| `facility` | Facility name for log categorization | `bsb` |
| `additionalFields` | Custom fields included in all messages | `{}` |
| `compress` | Enable gzip compression | `true` |
| `levels` | Log level filtering | All enabled |

## Usage

Once configured, logs are automatically sent to Graylog:

```typescript
this.log.info("Service initialized");
this.log.error("Failed to connect", new Error("Connection timeout"));
```

## Graylog Setup

Create a GELF input in Graylog:

1. Navigate to System -> Inputs
2. Select GELF UDP/TCP/HTTP
3. Launch a new input and configure the port

## Documentation

Detailed documentation (used by the BSB Registry): `https://github.com/BetterCorp/better-service-base/blob/master/plugins/nodejs/observable-graylog/docs/plugin.md`

## Links

- GitHub: `https://github.com/BetterCorp/better-service-base/tree/master/plugins/nodejs/observable-graylog`
- BSB Registry (package): `https://io.bsbcode.dev/packages/nodejs/@bsb/observable-graylog`

## License

Dual-licensed under AGPL-3.0-only OR Commercial License.
