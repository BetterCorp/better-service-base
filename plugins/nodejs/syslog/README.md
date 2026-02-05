# @bsb/syslog

Syslog server and client for BSB - receive syslog messages and send logs to syslog servers.

## Installation

```bash
npm install @bsb/syslog
```

## Features

### Syslog Server
- **Receive syslog messages** - UDP/TCP protocols
- **RFC compliance** - Supports RFC 3164 and RFC 5424
- **Event emission** - Emit received messages as BSB events
- **Client API** - Subscribe to syslog messages from other services

### Syslog Client (Observable)
- **Send BSB logs to syslog** - Forward application logs
- **Multiple protocols** - UDP, TCP, TLS support
- **RFC compliance** - RFC 3164 and RFC 5424
- **Level filtering** - Control which log levels are sent

## Configuration

### Server Configuration

```yaml
plugins:
  services:
    - plugin: "@bsb/syslog"
      service: "SyslogServerPlugin"
      enabled: true
      config:
        port: 514
        address: "0.0.0.0"
        exclusive: false
```

### Client (Observable) Configuration

```yaml
plugins:
  observables:
    - plugin: "@bsb/syslog"
      observable: "SyslogClientPlugin"
      enabled: true
      config:
        host: "localhost"
        port: 514
        protocol: "udp"
        facility: 16
        appName: "my-app"
        rfc: "5424"
        levels:
          debug: true
          info: true
          warn: true
          error: true
```

## Usage

```typescript
import { 
  SyslogServerPlugin, 
  SyslogServerClient, 
  SyslogClientPlugin 
} from "@bsb/syslog";
```

## License

Dual-licensed under AGPL-3.0-only OR Commercial License.
