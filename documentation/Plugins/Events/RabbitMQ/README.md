---
lang: en-US
title: RabbitMQ Plugin
description: RabbitMQ events plugin for BSB
footer: Copyright © 2016-present BetterCorp (PTY) Ltd - All rights reserved
---

# RabbitMQ events plugin

## Setting up RabbitMQ

Docker compose example:  

```yaml
  rabbitmq:
    image: rabbitmq:3-management
    ports:
      - "15673:15672"
      - "5673:5672"
    environment:
      - RABBITMQ_DEFAULT_USER={username}
      - RABBITMQ_DEFAULT_PASS={secure password}
```

## Setting up BSB

### RabbitMQ plugin config  

```json
"events-rabbitmq": {
  "prefetch": 10,
  "endpoint": "amqp://localhost",
  "credentials": {
    "username": "guest",
    "password": "guest"
  },
  "uniqueId": null
}
```

Channels/subscriptions and events are handled automatically.  

