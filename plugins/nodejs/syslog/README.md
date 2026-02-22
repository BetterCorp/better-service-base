# @bsb/syslog

Syslog server and client plugins for BSB. Receive syslog messages from devices and forward BSB logs to syslog servers using UDP, TCP, or TLS.

## Features

- Syslog server for UDP and TCP
- Syslog client (observable) for UDP, TCP, and TLS
- RFC 3164 and RFC 5424 support
- Event-driven processing of incoming syslog messages
- Log level filtering and facility configuration

## Installation

```bash
npm install @bsb/syslog
```

## Configuration

### Syslog Server (Service Plugin)

```yaml
plugins:
  services:
    - plugin: "@bsb/syslog"
      service: "service-syslog-server"
      enabled: true
      config:
        port: 514
        address: "0.0.0.0"
        exclusive: false
```

### Syslog Client (Observable Plugin)

```yaml
plugins:
  observables:
    - plugin: "@bsb/syslog"
      observable: "observable-syslog"
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

### Notes

- Port 514 is privileged on Unix-like systems. Use a port above 1024 if you cannot run as root.
- Use `facility` values 16-23 (local0-local7) for custom applications.

## Usage

Subscribe to incoming syslog messages with the server client:

```typescript
import { Client as SyslogServerClient } from "@bsb/syslog/lib/plugins/service-syslog-server";

const syslogClient = new SyslogServerClient(this);
await syslogClient.events.onEvent("onMessage", this.obs, async (obs, message) => {
  obs.log.info("Received syslog from {host}", { host: message.host });
});
```

## Documentation

- Syslog Server: `https://github.com/BetterCorp/better-service-base/blob/master/plugins/nodejs/syslog/docs/syslog-server.md`
- Syslog Client: `https://github.com/BetterCorp/better-service-base/blob/master/plugins/nodejs/syslog/docs/syslog-client.md`
These docs are used by the BSB Registry.

## Links

- GitHub: `https://github.com/BetterCorp/better-service-base/tree/master/plugins/nodejs/syslog`
- BSB Registry (package): `https://io.bsbcode.dev/packages/nodejs/@bsb/syslog`

## License

(AGPL-3.0-only OR Commercial)
