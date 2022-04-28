---
lang: en-US
title: Logging plugins
description: Logging plugins for BSB
---

# BSB Logging  

## About  

Additional logging functions/plugins for BSB.  

## Using logging

```ts
await this.log.debug("This is a debug log");
await this.log.warn("This is a warning log");
await this.log.error("This is a error log");
await this.log.info("This is a info log");
```

All log events are async, since they can (on a basic level) log to console.X or to a logging plugin (if enabled).  

## BSB Logging Plugins

### [Gelf](/Logging/Gelf)
