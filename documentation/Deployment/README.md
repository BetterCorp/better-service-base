---
lang: en-US
title: Deployment
description: BSB Deployment
footer: Copyright © 2016-present BetterCorp (PTY) Ltd - All rights reserved
---

# BSB Deployment  

## Docker

[betterweb/service-base](https://hub.docker.com/r/betterweb/service-base)  

This is the base docker image.  
This image contains basically nothing except the default plugins (log-default, events-default, config-default)  
  

### Environment variables

- BSB_SEC_JSON = `./sec.config.json`  
Specifically define the location to the `default-config` `sec.config.json` file

- BSB_PROFILE = `default`  
Sets the deployment profile of the service.  
This defines the specific containers profile and what service(s) that will be running in the container.  

- BSB_CONFIG_PLUGIN = ` ` (not set)  
Defines the config plugin to use.
When not set, it will use the `sec.config.json` file.  
The config plugin is the only plugin that may have additional environment variables to set.  
The rest of the plugins configuration is set in the config plugins definition. *(see config plugin docs for more info)*  

- BSB_PLUGINS = ` ` (comma seperated list of plugins)  
If defined, we'll automatically install the plugins if not already installed.  
What this allows you to do is have a seperate container to manage deployments/versions, and then a lightweight main container for the actual services themselves.  
Or for a simpler deployment (like below), a single container that will set itself up if the plugins aren't setup/installed.  


## Deployment

An example docker compose file for a service.

```yaml  
  service:
    image: betterweb/service-base:node
    volumes:
      - /etc/localtime:/etc/localtime:ro
      - /home/bsb/config.json:/home/bsb/sec.config.json:ro
    environment:
      - BSB_PROFILE=my-service
      - BSB_PLUGINS=@bettercorp/service-base-plugin-web-server
    deploy:
      replicas: 2
      update_config:
        parallelism: 1
        order: start-first
```

This installs web-server plugin on boot. However it doesn't do much else *(we'll add a demo plugin in the future)*  
You can list your plugins, or have a seperate container to do the installation of your plugins.  

## Requirements

- A server running docker (docker swarm/kubernetes/nomad)  
- An events service (should you want to run more than 1 service...)
  - Example: RabbitMQ/Pubnub/Kafka


## Directories (in the container)

- `/home/bsb/sec.config.json` - The config file  

- `/mnt/bsb-plugins` - package like directory which will contain all the installed plugins.  
This allows you to mount the dir for multiple containers (or use a shared volume) thus allowing the saving of storage space and A/B testing.


  