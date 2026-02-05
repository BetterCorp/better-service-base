# Overview

RabbitMQ Events plugin for BSB that provides a distributed event bus using RabbitMQ/AMQP. This plugin enables communication between multiple processes, containers, and microservices with reliable message delivery and advanced routing capabilities.

## Key Features

- Distributed event bus across multiple processes and containers
- Full support for all BSB event patterns (Fire-and-Forget, Request-Response, Broadcast, Streaming)
- AMQP protocol with RabbitMQ cluster support
- Reliable message delivery with acknowledgments
- Configurable prefetch for load balancing
- Platform isolation with multi-tenancy support
- Automatic reconnection with error handling
- Unique client identification for message routing

## When to Use

Use this plugin when you need:

- Communication between multiple service instances or containers
- Distributed microservices architecture
- Message persistence and delivery guarantees
- Load balancing across multiple service instances
- Service-to-service communication in Kubernetes or Docker environments
- High availability with RabbitMQ clustering

### About RabbitMQ

RabbitMQ is a robust, open-source message broker that implements the Advanced Message Queuing Protocol (AMQP). It provides reliable message delivery, flexible routing, and clustering capabilities for distributed systems.

---

# Installation

```bash
npm install @bettercorp/service-base-plugin-events-rabbitmq
```

# Configuration

Add the plugin to your BSB configuration file:

```yaml
plugins:
  events:
    plugin: "@bettercorp/service-base-plugin-events-rabbitmq"
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

## Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `endpoints` | Array of RabbitMQ server URLs (cluster support) | `["amqp://localhost"]` |
| `credentials.username` | RabbitMQ username | `guest` |
| `credentials.password` | RabbitMQ password | `guest` |
| `prefetch` | Number of messages to prefetch per consumer | `10` |
| `fatalOnDisconnect` | Exit process on connection loss | `true` |
| `platformKey` | Isolate multiple BSB platforms on same RabbitMQ | `null` |
| `uniqueId` | Static client ID (uses hostname if not set) | `null` |

### Configuration Details

#### endpoints

An array of RabbitMQ server URLs. When multiple endpoints are provided, the plugin will attempt to connect to them in order for high availability:

```yaml
endpoints:
  - "amqp://rabbitmq-1:5672"
  - "amqp://rabbitmq-2:5672"
  - "amqp://rabbitmq-3:5672"
```

#### prefetch

Controls how many messages a consumer can process simultaneously. Lower values (1-5) provide better load distribution but higher overhead. Higher values (10-50) improve throughput but may cause uneven load distribution:

```yaml
prefetch: 10  # Good balance for most cases
```

#### fatalOnDisconnect

When `true`, the service exits if RabbitMQ connection is lost. This is useful in container environments where you want the orchestrator to restart the service:

```yaml
fatalOnDisconnect: true  # Recommended for Kubernetes/Docker
```

#### platformKey

Allows running multiple BSB platforms on the same RabbitMQ instance without event collision:

```yaml
platformKey: "production"  # Isolates prod from dev/staging
```

#### uniqueId

Provides a static identifier for the client. Useful for tracking specific instances in logs:

```yaml
uniqueId: "api-server-1"  # Otherwise uses hostname + UUID
```

# Usage

Once configured, the plugin provides the same event interface as other BSB event plugins. All event patterns work identically to `events-default` but operate across distributed services.

## Fire-and-Forget

Send an event to any available listener. RabbitMQ load-balances across multiple instances:

```typescript
import { BSBService, BSBServiceConstructor } from "@bsb/base";

export class OrderService extends BSBService {
  constructor(context: BSBServiceConstructor) {
    super(context);
  }

  async init(): Promise<void> {
    // Emit event - any listener will handle it
    await this.events.emitEvent("order.created", {
      orderId: "12345",
      items: [{ sku: "ABC", qty: 2 }]
    });
  }
}

// In another service (or another container)
export class FulfillmentService extends BSBService {
  async init(): Promise<void> {
    // Listen for events - RabbitMQ ensures only one instance handles it
    await this.events.onEvent(
      "order.created",
      async (data) => {
        await this.processOrder(data.orderId, data.items);
      }
    );
  }
}
```

## Request-Response

Send an event and wait for a response from a handler:

```typescript
export class UserService extends BSBService {
  async validateUser(email: string): Promise<boolean> {
    // Emit and wait for response (with timeout)
    const result = await this.events.emitEventAndReturn(
      "user.validate",
      { email },
      5000  // 5 second timeout
    );
    return result.valid;
  }
}

// Validation service (can be in different container)
export class ValidationService extends BSBService {
  async init(): Promise<void> {
    await this.events.onReturnableEvent(
      "user.validate",
      async (data) => {
        const isValid = await this.checkEmail(data.email);
        return { valid: isValid };
      }
    );
  }
}
```

## Broadcast

Send an event to ALL registered listeners across all instances:

```typescript
export class CacheService extends BSBService {
  async invalidateCache(keys: string[]): Promise<void> {
    // Broadcast to ALL cache instances
    await this.events.emitBroadcast("cache.invalidate", { keys });
  }
}

// Each cache instance receives the broadcast
export class LocalCacheService extends BSBService {
  async init(): Promise<void> {
    await this.events.onBroadcast(
      "cache.invalidate",
      async (data) => {
        for (const key of data.keys) {
          await this.localCache.delete(key);
        }
      }
    );
  }
}
```

## Streaming

Stream data between services (bidirectional):

```typescript
export class FileService extends BSBService {
  async uploadFile(file: Readable): Promise<void> {
    // Request a stream handler
    const streamId = await this.events.receiveStream(
      "file.upload",
      async (error, stream) => {
        if (error) {
          this.log.error("Stream error", error);
          return;
        }
        await this.processFileStream(stream);
      },
      30  // 30 second timeout
    );

    // Send file stream
    await this.events.sendStream("file.upload", streamId, file);
  }
}
```

# RabbitMQ Setup

## Basic Setup

1. Install RabbitMQ:
```bash
# Docker
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:management

# Or use package manager
apt-get install rabbitmq-server
```

2. Access management UI at http://localhost:15672 (guest/guest)

## Production Setup

For production deployments, consider:

1. **Enable authentication**: Create dedicated users instead of using guest
```bash
rabbitmqctl add_user bsb_user secure_password
rabbitmqctl set_permissions -p / bsb_user ".*" ".*" ".*"
```

2. **Configure clustering**: For high availability
```bash
# On each node after initial setup
rabbitmqctl stop_app
rabbitmqctl join_cluster rabbit@node1
rabbitmqctl start_app
```

3. **Set resource limits**: Configure memory and disk thresholds
```bash
# /etc/rabbitmq/rabbitmq.conf
vm_memory_high_watermark.relative = 0.4
disk_free_limit.absolute = 2GB
```

4. **Monitor queues**: Use the management UI or metrics plugins to monitor queue depths and message rates

## Kubernetes Deployment

Example RabbitMQ deployment for Kubernetes:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: rabbitmq
spec:
  ports:
  - port: 5672
    name: amqp
  - port: 15672
    name: management
  selector:
    app: rabbitmq
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: rabbitmq
spec:
  serviceName: rabbitmq
  replicas: 3
  selector:
    matchLabels:
      app: rabbitmq
  template:
    metadata:
      labels:
        app: rabbitmq
    spec:
      containers:
      - name: rabbitmq
        image: rabbitmq:3-management
        ports:
        - containerPort: 5672
        - containerPort: 15672
        env:
        - name: RABBITMQ_ERLANG_COOKIE
          value: "your-secret-cookie"
```

# Troubleshooting

## Connection Issues

If the service can't connect to RabbitMQ:

1. Check RabbitMQ is running:
```bash
rabbitmqctl status
```

2. Verify network connectivity:
```bash
telnet rabbitmq-host 5672
```

3. Check credentials and permissions:
```bash
rabbitmqctl list_users
rabbitmqctl list_permissions
```

## Performance Issues

If message processing is slow:

1. Increase `prefetch` value for higher throughput
2. Scale horizontally by running more service instances
3. Monitor queue depths in RabbitMQ management UI
4. Check for slow event handlers causing backpressure

## Memory Issues

If RabbitMQ runs out of memory:

1. Check queue depths - messages may be accumulating
2. Increase RabbitMQ memory limits
3. Implement dead letter queues for failed messages
4. Review `prefetch` settings to prevent over-fetching

# Differences from events-default

The RabbitMQ events plugin provides the same API as `events-default` but with these key differences:

| Feature | events-default | events-rabbitmq |
|---------|---------------|-----------------|
| Scope | Single process | Multi-process/container |
| Persistence | No | Yes (RabbitMQ durable queues) |
| Load balancing | No | Yes (automatic) |
| Delivery guarantees | Best effort | At-least-once |
| Latency | Sub-millisecond | 1-10ms typical |
| Setup complexity | None | Requires RabbitMQ server |
| Scalability | Single process | Horizontal scaling |

# Best Practices

1. **Use platformKey in shared environments**: Isolate dev, staging, and production on the same RabbitMQ instance
2. **Set appropriate prefetch**: Balance between throughput and load distribution
3. **Enable fatalOnDisconnect in containers**: Let orchestrators restart failed instances
4. **Monitor queue depths**: Set up alerts for growing queues
5. **Use unique event names**: Prefix events with service name (e.g., "order.created" not just "created")
6. **Handle timeouts**: Always set reasonable timeouts for request-response patterns
7. **Log connection events**: Monitor reconnection patterns to detect infrastructure issues
