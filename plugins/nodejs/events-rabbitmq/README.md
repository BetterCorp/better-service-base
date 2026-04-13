# @bsb/events-rabbitmq

RabbitMQ events plugin for BSB that provides a distributed event bus using AMQP. It enables communication between multiple processes, containers, and microservices with reliable delivery and advanced routing.

## Key Features

- Distributed event bus across multiple processes and containers
- Full support for all BSB event patterns (fire-and-forget, request-response, broadcast, streaming)
- RabbitMQ cluster support with automatic reconnection
- Reliable message delivery with acknowledgments
- Configurable prefetch for load balancing
- Platform isolation with multi-tenancy support
- Unique client identification for routing

## Installation

```bash
npm install @bsb/events-rabbitmq
```

## Configuration

Add the plugin to your BSB configuration file:

```yaml
plugins:
  events:
    plugin: "@bsb/events-rabbitmq"
    enabled: true
    config:
      endpoints:
        - "amqp://localhost:5672"
      credentials:
        username: "guest"
        password: "guest"
      prefetch: 10
      fatalOnDisconnect: true
      platformKey: null
      uniqueId: null
```

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `endpoints` | Array of RabbitMQ server URLs (cluster support) | `["amqp://localhost"]` |
| `credentials.username` | RabbitMQ username | `guest` |
| `credentials.password` | RabbitMQ password | `guest` |
| `prefetch` | Messages to prefetch per consumer | `10` |
| `fatalOnDisconnect` | Exit process on connection loss | `true` |
| `platformKey` | Isolate multiple BSB platforms on same RabbitMQ | `null` |
| `uniqueId` | Static client ID (uses hostname if not set) | `null` |

## Usage

Once configured, the plugin provides the same API as `events-default`, but distributed across RabbitMQ.

### Fire-and-Forget

```typescript
await this.events.emitEvent("order.created", {
  orderId: "12345",
  items: [{ sku: "ABC", qty: 2 }]
});
```

### Request-Response

```typescript
const result = await this.events.emitEventAndReturn(
  "user.validate",
  { email: "user@example.com" },
  5000
);
```

### Broadcast

```typescript
await this.events.emitBroadcast("cache.invalidate", { keys: ["a", "b"] });
```

### Streaming

```typescript
const streamId = await this.events.receiveStream("file.upload", handler, 30);
await this.events.sendStream("file.upload", streamId, fileStream);
```

## RabbitMQ Setup

For local development, the RabbitMQ management image is a quick start:

```bash
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:management
```

## Documentation

Detailed documentation (used by the BSB Registry): `https://github.com/BetterCorp/better-service-base/blob/master/plugins/nodejs/events-rabbitmq/docs/plugin.md`

## Links

- GitHub: `https://github.com/BetterCorp/better-service-base/tree/master/plugins/nodejs/events-rabbitmq`
- BSB Registry (package): `https://io.bsbcode.dev/packages/nodejs/@bsb/events-rabbitmq`

## License

(AGPL-3.0-only OR Commercial)
