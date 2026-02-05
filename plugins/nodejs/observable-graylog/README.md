# @bsb/observable-graylog

Graylog (GELF) observable plugin for BSB - send logs to Graylog servers using the GELF protocol.

## Installation

```bash
npm install @bsb/observable-graylog
```

## Features

- **GELF 1.1 protocol** - Full Graylog Extended Log Format support
- **Multiple transports** - UDP, TCP, and HTTP
- **Custom fields** - Automatic trace/span integration
- **Compression** - Optional gzip compression
- **Level filtering** - Control which logs are sent

## Configuration

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

- **host**: Graylog server hostname
- **port**: Graylog GELF input port
- **protocol**: "udp", "tcp", or "http"
- **httpEndpoint**: HTTP endpoint URL (for HTTP protocol)
- **facility**: Facility name for log categorization
- **additionalFields**: Custom fields included in all messages
- **compress**: Enable gzip compression
- **levels**: Log level filtering

## License

Dual-licensed under AGPL-3.0-only OR Commercial License.
