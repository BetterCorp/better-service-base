---
lang: en-US
title: Gelf plugin
description: Gelf logging plugin for BSB
---

# Gelf logging plugin

## Setting up BSB

### Gelf plugin config  

```json
"log-gelf": {
  "adapterName": "udp",
  "adapterOptions": {
    "host": "127.0.0.1",
    "port": 12201,
    "family": 4,
    "timeout": 10000
  }
}
```

Once it is enabled, it is automatically used.  