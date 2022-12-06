---
lang: en-US
title: Plugins
description: Plugins for BSB
footer: Copyright © 2016-present BetterCorp (PTY) Ltd - All rights reserved
---

# BSB Plugins

## What are plugins?

Plugins, plugins and more plugins available for use.

## Plugin types

There are 4 types of plugins for BSB.

### Service

These are the plugins where you'd normally write your code to do stuff.  
From connecting with other service plugins or other services themselves (apis etc).  

Inside the `plugins/` dir, you'd name them `service-{pluginname}`.  

For services, you create client plugins for easy use/communication with the plugin.  
Inside the `clients/` dir, you'd name them `service-{pluginname}`.  
  
*In the future, we'd like to find a way where clients don't have to be build/maintained, however for now it's the middleground chosen.*

### Events

These plugins handle inter-plugin communication.  

Inside the `plugins/` dir, you'd name them `events-{pluginname}`.

### Logging

These plugins handle logging of the app, so instead of to console, you can send the logs to a log aggregator.  

Inside the `plugins/` dir, you'd name them `log-{pluginname}`.

### Config

These plugins handle the app/plugin config as well as what plugins/events to use.  

Inside the `plugins/` dir, you'd name them `config-{pluginname}`.

## Marketplace

You can view all the public plugins available at the [Plugin Marketplace](/Market/)

## Notes

Some packages could have multiple plugin types built into a single npm package.  
An example would be `@bettercorp/service-base-plugin-config-1password` - it has the config plugin type (`config-1password`), and a standard plugin type (`service-1password`).  
The config plugin type defines the configuration for deployment whereas the standard plugin type allows other plugins to read/write 1password vaults.


## Folder structure  

```fs
src/  
  clients/  
    {plugintype}-{pluginname}/
      plugin.ts  
  plugins/  
    {plugintype}-{pluginname}/
      plugin.ts  
      sec.config.ts  
```  

Once compiled down:  
```fs
lib/  
  clients/  
    {plugintype}-{pluginname}/
      plugin.js  
  plugins/  
    {plugintype}-{pluginname}/
      plugin.js  
      sec.config.js  
```  

The BSB automatically looks in for plugins in this folder structure.  

The `sec.config` file controls your plugins config / default configuration definition, as well as for documentation on the plugin marketplace.  

```ts  
export interface PluginConfig extends IPluginConfig {
  exampleBoolean: boolean; // {Variable title}: {Variable description}
  exampleNumber: number; // {Variable title}: {Variable description}
  exampleString?: string; // {Variable title}: {Variable description}
}

export class Config extends SecConfig<PluginConfig> {
  migrate(
    mappedPluginName: string,
    existingConfig: PluginConfig | null
  ): PluginConfig {
    return {
      exampleBoolean: existingConfig.exampleBoolean || false,
      exampleNumber: existingConfig.exampleNumber || 0
      exampleString: existingConfig.exampleString // this can be undefined, and we do not care about a default value
    };
  }
}
```  

Make sure all interfaces/enums used for the Config class are within this file - otherwise our marketplace builder will be unable to define the properties correctly.  