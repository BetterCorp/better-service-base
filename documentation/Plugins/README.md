---
lang: en-US
title: Plugins
description: Plugins for BSB
footer: Copyright © 2016-present BetterCorp (PTY) Ltd - All rights reserved
---

# BSB Plugins

## About

Plugins, plugins and more plugins available for use.

## Plugin types

There are 4 types of plugins for BSB.

- [Plugin](/Plugins/Plugins/) - this is just a standard integration plugin
- [Events](/Plugins/Events/) - these plugins handle inter-plugin communication
- [Config](/Plugins/Config/) - these plugins handle the app/plugin config as well as what plugins/events to use.
- [Logging](/Plugins/Logging/) - these plugins handle logging of the app, so instead of to console, you can send the logs to a log aggregator

Some packages could have multiple plugin types built into a npm package.  
An example would be `config-1password` - it has the config plugin type, and a standard plugin type.  
The config plugin type defines the configuration for deployment whereas the standard plugin type allows other plugins to read/write 1password vaults.
