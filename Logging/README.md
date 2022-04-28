---
lang: en-US
title: Logging plugins
description: Logging plugins for BSB
footer: Copyright © 2016-present BetterCorp (PTY) Ltd - All rights reserved
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
await this.log.fatal("This is a fatal log"); // this will also exit the process with code 1, and force the service to restart.
```

All log events are async, since they can (on a basic level) log to console.X or to a logging plugin (if enabled).  

## BSB Logging Plugins

### [Gelf](/Logging/Gelf)
