---
lang: en-US
title: Gelf plugin
description: Gelf logging plugin for BSB
footer: Copyright © 2016-present BetterCorp (PTY) Ltd - All rights reserved
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