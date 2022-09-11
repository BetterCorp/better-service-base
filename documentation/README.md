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

<div style="background: orange; color: black; padding: 5px 10px 5px 10px; border-radius: 5px; text-align: center; font-weight: 700;">THIS DOCUMENTATION IS A WORK IN PROGRESS</div>

[![Docker Image Size](https://img.shields.io/docker/image-size/betterweb/service-base/latest)](https://hub.docker.com/repository/docker/betterweb/service-base) 
[![Docker Pulls](https://img.shields.io/docker/pulls/betterweb/service-base)](https://hub.docker.com/repository/docker/betterweb/service-base) 
[![Docker Image Version (latest semver)](https://img.shields.io/docker/v/betterweb/service-base?sort=semver)](https://hub.docker.com/repository/docker/betterweb/service-base) 
[![GitHub](https://img.shields.io/github/license/BetterCorp/better-service-base)](https://github.com/BetterCorp/better-service-base) 
[![GitHub commit activity (branch)](https://img.shields.io/github/commit-activity/m/bettercorp/better-service-base/develop)](https://github.com/BetterCorp/better-service-base) 
[![GitHub last commit (branch)](https://img.shields.io/github/last-commit/bettercorp/better-service-base/develop)](https://github.com/BetterCorp/better-service-base) 
[![GitHub Repo stars](https://img.shields.io/github/stars/BetterCorp/better-service-base)](https://github.com/BetterCorp/better-service-base) 
[![GitHub pull requests](https://img.shields.io/github/issues-pr-raw/BetterCorp/better-service-base)](https://github.com/BetterCorp/better-service-base/pulls) 
[![GitHub issues](https://img.shields.io/github/issues-raw/BetterCorp/better-service-base)](https://github.com/BetterCorp/better-service-base/issues) 
[![GitHub Workflow Status](https://img.shields.io/github/workflow/status/BetterCorp/better-service-base/Build%20and%20Publish%20Containers%20(LIVE))](https://github.com/BetterCorp/better-service-base/actions/workflows/tags.yml) 
[![Build and Publish (EA)](https://github.com/BetterCorp/better-service-base/actions/workflows/develop.yml/badge.svg?branch=develop)](https://github.com/BetterCorp/better-service-base/actions/workflows/develop.yml)
[![Build and Publish (RC)](https://github.com/BetterCorp/better-service-base/actions/workflows/master.yml/badge.svg?branch=master)](https://github.com/BetterCorp/better-service-base/actions/workflows/master.yml)
[![codecov](https://codecov.io/gh/BetterCorp/better-service-base/branch/master/graph/badge.svg)](https://codecov.io/gh/BetterCorp/better-service-base) 
[![node-current (scoped)](https://img.shields.io/node/v/@bettercorp/service-base)](https://www.npmjs.com/package/@bettercorp/service-base)  
[![npm](https://img.shields.io/npm/dt/@bettercorp/service-base)](https://www.npmjs.com/package/@bettercorp/service-base) 
[![npm bundle size (scoped)](https://img.shields.io/bundlephobia/min/@bettercorp/service-base)](https://www.npmjs.com/package/@bettercorp/service-base) 
[![npm (scoped)](https://img.shields.io/npm/v/@bettercorp/service-base)](https://www.npmjs.com/package/@bettercorp/service-base) 

## About

BSB was designed to be a simple, expandable and server agnostic platform for simple, scalable microservice projects.  

From v8 of the BSB, a single container can be deployed with a linked volume to minize the storage space required for deployment.  
See [Docker Deployment](/Deployment)  for deployment configurations
  
## Docker

[betterweb/service-base](https://hub.docker.com/r/betterweb/service-base)  

This is the base docker image.  
This image contains basically nothing except the default plugins (log-default, events-default, config-default)  
  
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

Look at the [Market](/Market) for a list of active plugins and how to use them