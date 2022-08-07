---
lang: en-US
title: Config plugins
description: Config plugins for BSB
footer: Copyright © 2016-present BetterCorp (PTY) Ltd - All rights reserved
---

# BSB Config  

## About  

Config management is mostly background handled and there isn't any way to make config changes during a run.  
Any changes to the config will require a service restart in order to pickup the changes.  
When running in debug mode (`npm run dev`), changes to the `sec.config.json` file will automatically restart the service.  

## The `sec.config.json` file   

```json
{
  "identity": "development",
  "debug": true,
  "deploymentProfiles": {
    "{deployment profile name}": {
      "{plugin name}": {
        "mappedName": "{name of the plugin as mapped}",
        "enabled": {true/false}
      }
    }
  },
  "plugins": {
    "{name of the plugin as mapped}": {
      "prefetch": 10,
      "endpoint": "amqp://localhost",
      "credentials": {
        "username": "guest",
        "password": "guest"
      },
      "uniqueId": null
    }
  }
}
```

Mapped plugin names allow you to run multiple plugins with different names when using a central config file.  
Example: `fastify` mapped to `web`  

Thus a single sec.config file can have multiple configs for fastify, but with different names with different configs.  

## Accessing plugin config    

```ts
let myConfig = await this.getPluginConfig();
```


## BSB Config Plugins

### [1Password](/Config/1Password)