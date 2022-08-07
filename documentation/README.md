---
home: true
heroText: Better-Service-Base
tagline: A simple yet scalable microservice base
features:
- title: Start Simple
  details: Get started quickly, expand infinitely
- title: Event Based
  details: BSB is completely event based.  Choose the event broker that suites your needs, or build one if it doesn't exist yet.
- title: Scalable
  details: Services are designed to be containerized and scaled to meet demand.
footer: Copyright © 2016-present BetterCorp (PTY) Ltd - All rights reserved
---

## About

BSB was designed to be a simple, expandable and server agnostic platform for simple, scalable microservice projects.  

From v8 of the BSB, a single container can be deployed with a linked volume to minize the storage space required for deployment.  
See [Docker Deployment](/Deployment)  for deployment configurations
  
## Docker

[betterweb/service-base](https://hub.docker.com/r/betterweb/service-base)  

This is the base docker image that is kept up to date with the basic event/config/logging plugins.
  
### Environment variables

- APP_DIR = `./`

Defaults to the current CWD if not set.
Allows you to change the working directory of the project (ideal to customize where the service looks for plugins)

- BSB_LIVE = `(not set - set to true to force live mode / leave empty for debug or non-production)`

Defines if the service is running on production/live mode
When not running in production mode, debug is enabled by default vs disabled when running in production.

- BSB_SEC_JSON = `./sec.config.json`

Defines a specific path (full path) to the `sec.config.json` configuration file if you are using one.
(read/write when running non-live)  

- BSB_CONFIG_OBJECT = `(not set)`
 
Allows you to pass the config object is serialized json directly to the service instead of using a json file / config plugin.

- BSB_FORCE_DEBUG = `(not set - set to true to force debug mode in production / leave empty for false)`

Forced debug mode when deubgging in production.

- BSB_PROFILE = `default`

Sets the deployment profile of the service. 
This makes it easy to use a single `sec.config.json` file, to centralize config for multiple plugins/services, while just controlling which service runs in specific containers.  

- BSB_CONFIG_PLUGIN = `(not set)`  

Defines the config plugin to use.
When not set, it will use `BSB_CONFIG_OBJECT` then `BSB_SEC_JSON` then the default `sec.config.json` file/objects respectively.  

The config plugin is the only plugin that may have additional environment variables to set. The rest of the plugins configuration is set in the `sec.config.json` file or other configuration locations respectively.


## Deployment

An example docker compose file for a service.

```yaml  
  payfast:
    image: betterweb/service-base-plugin-{plugin-name}:{plugin-version}
    volumes:
      - /etc/localtime:/etc/localtime:ro
      - /home/bsb/config.json:/home/app/sec.config.json:ro
    environment:
      - BSB_LIVE=true
      - BSB_PROFILE=service1
    deploy:
      replicas: 2
      update_config:
        parallelism: 1
        order: start-first
```


## Requirements

- A server running docker (docker swarm/kubernetes/nomad)  
- An events service (should you want to run more than 1 service...)
  - Example: RabbitMQ/Pubnub


## Getting started

- run the docker image with the required configuration.  

Look at [Plugins](/Plugins) for the already made list of plugins and how to use them
