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

### Standard plugin/service

These are just normal plugins where you'd write your code.

### Events

These plugins handle inter-plugin communication.

### Logging

These plugins handle logging of the app, so instead of to console, you can send the logs to a log aggregator.

### Config

These plugins handle the app/plugin config as well as what plugins/events to use.

## Notes

Some packages could have multiple plugin types built into a npm package.  
An example would be `config-1password` - it has the config plugin type, and a standard plugin type.  
The config plugin type defines the configuration for deployment whereas the standard plugin type allows other plugins to read/write 1password vaults.
