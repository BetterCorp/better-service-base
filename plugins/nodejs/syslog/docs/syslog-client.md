# Syslog Client Plugin

Send BSB logs to remote syslog servers via UDP, TCP, or TLS.

## Overview

The Syslog Client Observable plugin forwards application logs to remote syslog servers, enabling integration with existing syslog infrastructure for centralized log management. This plugin implements both RFC 3164 (BSD syslog) and RFC 5424 (modern syslog) for maximum compatibility.

## Features

- **Multiple Protocols**: Support for UDP, TCP, and TLS transport protocols
- **RFC Compliance**: RFC 3164 and RFC 5424 syslog format support
- **Level Filtering**: Configure which log levels are sent to the syslog server
- **Configurable Facility**: Set syslog facility codes (0-23) for proper categorization
- **Custom Application Name**: Identify your application in syslog messages
- **Automatic Formatting**: BSB logs are automatically formatted and mapped to syslog severity levels

## Installation

```bash
npm install @bsb/syslog
```

## Configuration

Add the plugin to your BSB configuration file:

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

### Configuration Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `host` | string | Syslog server hostname or IP address | `localhost` |
| `port` | number | Syslog server port (1-65535) | `514` |
| `protocol` | string | Transport protocol: "udp", "tcp", or "tls" | `udp` |
| `facility` | number | Syslog facility code (0-23) | `16` (local0) |
| `hostname` | string | Override hostname in syslog messages | OS hostname |
| `appName` | string | Application name in syslog messages | `bsb-app` |
| `rfc` | string | Syslog format: "3164" or "5424" | `5424` |
| `levels.debug` | boolean | Send debug level logs | `true` |
| `levels.info` | boolean | Send info level logs | `true` |
| `levels.warn` | boolean | Send warning level logs | `true` |
| `levels.error` | boolean | Send error level logs | `true` |
| `tls` | object | TLS configuration options (when protocol is "tls") | - |
| `tls.rejectUnauthorized` | boolean | Reject unauthorized certificates | `true` |
| `tls.ca` | string | CA certificate | - |
| `tls.cert` | string | Client certificate | - |
| `tls.key` | string | Client private key | - |

### Facility Codes

Common syslog facility codes:

- `0-7`: System facilities (kern, user, mail, daemon, auth, syslog, lpr, news)
- `16-23`: Local use (local0-local7) - **Recommended for applications**

Local facilities (16-23) are typically used for custom applications. The default value of `16` (local0) is a safe choice for most BSB applications.

### Protocol Selection

**UDP (User Datagram Protocol)**
- Fast, connectionless delivery
- Fire-and-forget semantics
- No delivery guarantee (messages may be lost)
- Good for high-volume logging where occasional message loss is acceptable
- Lowest overhead and latency

**TCP (Transmission Control Protocol)**
- Reliable, connection-oriented delivery
- Guaranteed message delivery
- Connection management overhead
- Use when every log message must be delivered
- Slightly higher latency than UDP

**TLS (Transport Layer Security)**
- Encrypted TCP connection
- Authentication and security
- Higher overhead than plain TCP
- Use for secure log transmission over untrusted networks
- Requires additional TLS configuration

## Usage

Once configured, the plugin automatically forwards logs to the syslog server. No additional code is required in your services:

```typescript
import { BSBService, BSBServiceConstructor } from "@bsb/base";

export class MyService extends BSBService {
  constructor(context: BSBServiceConstructor) {
    super(context);
  }

  async init(): Promise<void> {
    // Logs are automatically sent to syslog server
    this.log.info("Service initialized");
    this.log.warn("Low memory warning");
    this.log.error("Failed to connect", new Error("Connection timeout"));
  }
}
```

### Log Level Mapping

BSB log levels are automatically mapped to syslog severity levels:

| BSB Level | Syslog Severity | RFC 5424 Value |
|-----------|-----------------|----------------|
| `error` | Error | 3 |
| `warn` | Warning | 4 |
| `info` | Informational | 6 |
| `debug` | Debug | 7 |

## Testing

### Using a Local Syslog Server

**Linux (rsyslog)**
```bash
# View syslog messages
sudo tail -f /var/log/syslog

# Or filter by application name
sudo grep "my-app" /var/log/syslog
```

**macOS (system log)**
```bash
# View logs for your application
log stream --predicate 'process == "my-app"'
```

### Using Logger Command

Test your syslog server using the `logger` command:

```bash
# Send a test message
logger -n localhost -P 514 "Test message from logger"

# Or use netcat to send raw syslog messages
echo "<134>Test syslog message" | nc -u localhost 514
```

### Using BSB Syslog Server

For testing and development, use the [Syslog Server plugin](./syslog-server.md) included in this package:

```typescript
import { BSBService, BSBServiceConstructor } from "@bsb/base";
import { Client as SyslogServerClient } from "@bsb/syslog/lib/plugins/service-syslog-server";

export class TestService extends BSBService {
  private syslogClient!: SyslogServerClient;

  constructor(context: BSBServiceConstructor) {
    super(context);
  }

  async init(): Promise<void> {
    this.syslogClient = new SyslogServerClient(this);

    // Subscribe to received syslog messages
    await this.syslogClient.events.onEvent("onMessage", this.obs, async (obs, message) => {
      obs.log.info("Received syslog: {message}", {
        message: message.message,
        host: message.host
      });
    });
  }
}
```

## Troubleshooting

### Connection Errors

If you see connection errors, verify:
1. Syslog server is running and accessible
2. Firewall rules allow traffic on the configured port
3. The host and port configuration are correct

### Messages Not Appearing

Check that:
1. Log level filtering is not too restrictive
2. The syslog server is configured to accept messages from your facility
3. UDP messages may be dropped on congested networks (try TCP)

### TLS Connection Issues

For TLS connections:
1. Verify certificates are valid and properly formatted
2. Check that the CA certificate matches the server's certificate chain
3. Ensure the server supports TLS on the configured port

## Related Plugins

- **[Syslog Server](./syslog-server.md)**: Receive syslog messages from network devices and applications
- **[@bsb/logging-default](https://bsb.bettercorp.dev/core-plugins/logging-default/)**: Default console logging for BSB

## License

(AGPL-3.0-only OR Commercial)

See the [LICENSE](../LICENSE) file for details.
