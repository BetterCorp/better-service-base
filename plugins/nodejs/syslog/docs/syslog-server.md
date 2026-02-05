# Syslog Server Plugin

Receive and process syslog messages from network devices and applications.

## Overview

The Syslog Server plugin enables your BSB application to act as a centralized syslog receiver for network devices, servers, and applications. This service plugin listens for incoming syslog messages over UDP and TCP protocols and emits events that your services can subscribe to for custom processing, monitoring, or forwarding.

## Features

- **Multiple Protocols**: Receive syslog messages over UDP and TCP
- **RFC Compliance**: RFC 3164 and RFC 5424 protocol support
- **Event-Driven**: Emit events for each received message
- **Client API**: Simple API for services to subscribe to syslog messages
- **Configurable Binding**: Set listening port and network interface
- **Automatic Parsing**: Messages are automatically parsed and structured

## Installation

```bash
npm install @bsb/syslog
```

## Configuration

Add the plugin to your BSB configuration file:

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

### Configuration Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `port` | number | Port to listen on (1-65535, standard is 514) | `514` |
| `address` | string | IP address to bind to (0.0.0.0 for all interfaces) | `0.0.0.0` |
| `exclusive` | boolean | Exclusive port binding | `false` |

> **Note**: Port 514 is a privileged port on Unix-like systems and requires root access. For non-root deployments, use a port above 1024 (e.g., 5514) and configure syslog clients accordingly.

## Usage

### Basic Service with Syslog Server Client

Use the client API to subscribe to received syslog messages:

```typescript
import { BSBService, BSBServiceConstructor } from "@bsb/base";
import { Client as SyslogServerClient } from "@bsb/syslog/lib/plugins/service-syslog-server";

export class MyService extends BSBService {
  private syslogClient!: SyslogServerClient;

  constructor(context: BSBServiceConstructor) {
    super(context);
  }

  async init(): Promise<void> {
    this.syslogClient = new SyslogServerClient(this);

    // Subscribe to all syslog messages
    await this.syslogClient.events.onEvent("onMessage", this.obs, async (obs, message) => {
      obs.log.info("Received syslog message from {host}", {
        host: message.host,
        message: message.message,
        protocol: message.protocol
      });

      // Custom processing based on message content
      if (message.message.includes("ERROR")) {
        await this.handleErrorMessage(message);
      }
    });
  }

  private async handleErrorMessage(message: any): Promise<void> {
    // Custom error handling logic
    this.log.error("Critical error detected in syslog: {message}", {
      message: message.message
    });
  }

  async dispose(): Promise<void> {
    // Cleanup
  }
}
```

### Syslog Message Structure

Each received syslog message contains the following properties:

```typescript
interface SyslogMessage {
  gatewayTime: number;    // Timestamp when message was received (milliseconds)
  date: number;           // Original message timestamp (milliseconds)
  host: string;           // Originating hostname or IP address
  protocol: string;       // Protocol used ("udp" or "tcp")
  message: string;        // Full syslog message content
}
```

### Filtering Messages

You can filter messages based on their content or source:

```typescript
await this.syslogClient.events.onEvent("onMessage", this.obs, async (obs, message) => {
  // Filter by host
  if (message.host === "192.168.1.100") {
    obs.log.info("Message from router: {message}", { message: message.message });
  }

  // Filter by message content
  if (message.message.includes("authentication failed")) {
    await this.handleAuthenticationFailure(message);
  }

  // Filter by protocol
  if (message.protocol === "tcp") {
    obs.log.debug("TCP syslog message received");
  }
});
```

### Advanced: Event-Based Processing

Build complex event processing workflows:

```typescript
export class SyslogMonitorService extends BSBService {
  private errorCount = 0;
  private alertThreshold = 10;

  async init(): Promise<void> {
    const syslogClient = new SyslogServerClient(this);

    await syslogClient.events.onEvent("onMessage", this.obs, async (obs, message) => {
      // Count error messages
      if (this.isErrorMessage(message)) {
        this.errorCount++;

        if (this.errorCount >= this.alertThreshold) {
          await this.sendAlert();
          this.errorCount = 0; // Reset counter
        }
      }

      // Store to database
      await this.storeMessage(message);
    });

    // Reset error counter every hour
    setInterval(() => {
      this.errorCount = 0;
    }, 3600000);
  }

  private isErrorMessage(message: any): boolean {
    const errorKeywords = ["error", "fail", "critical", "alert"];
    return errorKeywords.some(keyword =>
      message.message.toLowerCase().includes(keyword)
    );
  }

  private async sendAlert(): Promise<void> {
    this.log.error("Alert: Error threshold exceeded ({count} errors)", {
      count: this.alertThreshold.toString()
    });
    // Send notification via email, Slack, etc.
  }

  private async storeMessage(message: any): Promise<void> {
    // Store to database for long-term analysis
  }
}
```

## Testing

### Send Test Messages Using Logger

Test your syslog server using the `logger` command:

```bash
# Linux/macOS - send to localhost
logger -n localhost -P 514 "Test message from logger"

# Send with specific priority
logger -n localhost -P 514 -p local0.info "Info level message"

# Send multiple messages
for i in {1..10}; do
  logger -n localhost -P 514 "Test message $i"
done
```

### Send Test Messages Using Netcat

Use `netcat` (nc) to send raw syslog messages:

```bash
# UDP test message
echo "<134>Test syslog message" | nc -u localhost 514

# TCP test message
echo "<134>Test syslog message" | nc localhost 514
```

The priority value `<134>` breaks down as:
- Facility: 16 (local0)
- Severity: 6 (informational)
- Calculation: (16 * 8) + 6 = 134

### Send from BSB Syslog Client

Use the [Syslog Client plugin](./syslog-client.md) to send messages:

```yaml
# Configure syslog client to send to your server
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
        appName: "test-app"
```

### Verify Server is Listening

Check that the server is listening on the configured port:

```bash
# Linux/macOS
netstat -an | grep 514

# Or use lsof
lsof -i :514

# Windows
netstat -an | findstr 514
```

## Syslog Message Format

The plugin supports both RFC 3164 and RFC 5424 formats:

### RFC 3164 (BSD Syslog)

```
<Priority>Timestamp Hostname Tag: Message
```

Example:
```
<134>Dec 25 10:00:00 myhost myapp: Application started
```

### RFC 5424 (Modern Syslog)

```
<Priority>Version Timestamp Hostname AppName ProcID MsgID StructuredData Message
```

Example:
```
<134>1 2024-12-25T10:00:00.000Z myhost myapp - - - Application started
```

## Use Cases

### Network Device Monitoring

Collect logs from routers, switches, and firewalls:

```typescript
await syslogClient.events.onEvent("onMessage", this.obs, async (obs, message) => {
  // Check for interface down events
  if (message.message.includes("interface") && message.message.includes("down")) {
    obs.log.warn("Network interface down: {host}", { host: message.host });
    await this.notifyNetworkTeam(message);
  }
});
```

### Security Event Collection

Monitor authentication and security events:

```typescript
await syslogClient.events.onEvent("onMessage", this.obs, async (obs, message) => {
  if (message.message.includes("authentication failed")) {
    obs.log.warn("Authentication failure from {host}", { host: message.host });
    await this.trackFailedAuth(message.host);
  }
});
```

### Centralized Application Logging

Aggregate logs from multiple applications:

```typescript
const logDatabase = new Map<string, any[]>();

await syslogClient.events.onEvent("onMessage", this.obs, async (obs, message) => {
  // Store logs by host
  if (!logDatabase.has(message.host)) {
    logDatabase.set(message.host, []);
  }
  logDatabase.get(message.host)!.push(message);

  // Periodic analysis
  if (logDatabase.get(message.host)!.length >= 1000) {
    await this.analyzeLogsForHost(message.host);
  }
});
```

## Troubleshooting

### Server Not Receiving Messages

1. **Check server is running**: Verify the plugin is enabled and started
2. **Firewall**: Ensure firewall allows incoming traffic on the configured port
3. **Port binding**: For port 514, ensure the application has root/admin privileges
4. **Network interface**: Verify `address` is set correctly (0.0.0.0 for all interfaces)

### Messages Not Being Processed

1. **Event subscription**: Ensure your service is subscribing to the `onMessage` event
2. **Service initialization**: Verify your service's `init()` method is being called
3. **Check logs**: Look for any error messages in the BSB logs

### Performance Issues

1. **High message volume**: Consider implementing message batching
2. **Processing time**: Ensure message handlers are fast and don't block
3. **Use async/await**: Keep handlers asynchronous to avoid blocking the event loop

### Port Conflicts

If port 514 is already in use:
1. Check for other syslog services: `sudo lsof -i :514`
2. Use a different port (e.g., 5514)
3. Configure clients to send to the new port

## Related Plugins

- **[Syslog Client](./syslog-client.md)**: Send BSB logs to remote syslog servers
- **[@bsb/events-default](https://bsb.bettercorp.dev/core-plugins/events-default/)**: Default event bus for BSB

## License

(AGPL-3.0-only OR Commercial)

See the [LICENSE](../LICENSE) file for details.
