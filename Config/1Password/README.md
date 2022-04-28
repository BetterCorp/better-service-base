---
lang: en-US
title: 1Password config plugin
description: 1Password config plugin for BSB
---

# 1Password config plugin

## Setting up 1Password

View [1Password documentation](https://developer.1password.com/docs/connect/) to get started.

## Setting up BSB

### Environment variables

- BSB_OP_VAULT=`(enter vault id)`  
The vault ID to use as the config source of truth.  

- BSB_CONFIG_PLUGIN=`config-1password`  
Enable the plugin 

- BSB_OP_SERVER_URL=`http://op-connect-api:8080`  
Define the server url to the op connect api service 

- BSB_OP_TOKEN=`(enter token)`  
Set the token to connect to the vault - read only

## 1password definitions  

### Profile (deployment profile)

Title: `profile-{profile-name}`

These define the deployment profiles for micro-services.  

#### Sections  

The below sections define the plugin mapping.  

Title: `Profile Info`

| Title                 | Value                      | Description                           |
| --------------------- | -------------------------- | ------------------------------------- |
| notes                 |                            | Define additional notes/information   |
| debug                 | false                      | true/false - if debug mode is enabled |


Title: `Plugin Maps (Events)`

| Title                 | Value                      | Description                           |
| --------------------- | -------------------------- | ------------------------------------- |
| (plugin name)         | (name / mapped name)       | definition                            |
| events-rabbitmq       | events-rabbitmq            | example for rabbitMQ events plugin    |

Title: `Plugin Maps (Logging)`

| Title                 | Value                      | Description                           |
| --------------------- | -------------------------- | ------------------------------------- |
| (plugin name)         | (name / mapped name)       | definition                            |
| log-gelf              | log-gelf                   | example for GrayLog logging plugin    |

Title: `Plugin Maps (Plugins)`

| Title                 | Value                      | Description                           |
| --------------------- | -------------------------- | ------------------------------------- |
| (plugin name)         | (name / mapped name)       | definition                            |
| fastify               | fastify                    | example for fastify web-server plugin |


You can disable a plugin by adding a `!` in front of the value, setting the value as false, or by removing it from the list alltogether.


### Config

Title: `{plugin-mapped-name}`

These define the plugin config for each micro-service.  

#### Sections  

The below sections define the plugin config.  

Title: `Plugin Info`

| Title                 | Value                      | Description                           |
| --------------------- | -------------------------- | ------------------------------------- |
| notes                 |                            | Define additional notes/information   |

Title: `Config`

| Title                 | Value                      | Description                           |
| --------------------- | -------------------------- | ------------------------------------- |
| (path key)            | (value)                    | config definition                     |


#### Example: Fastify  

| Title                       | Value                             |
| --------------------------- | --------------------------------- |
| httpPort                    | 80                                |
| server                      | http                              |
| httpToHttpsRedirect         | false                             |
| httpsPort                   | 443                               |
| httpsCert                   | null                              |
| cors.enabled                | true                              |
| cors.options.allowedHeaders | content-type,authorization        |
| cors.options.methods        | GET,POST,PUT,PATCH,DELETE,OPTIONS |

Once converted to JSON:  
```json
{
  "httpPort": 80,
  "server": "http",
  "httpToHttpsRedirect": false,
  "httpsPort": 443,
  "httpsCert": null,
  "cors": {
    "enabled": true,
    "options": {
      "allowedHeaders": "content-type,authorization",
      "methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    }
  }
}
```

#### Example: Arrays  

| Title                       | Value                             |
| --------------------------- | --------------------------------- |
| servers.0                   | true                              |
| servers.1                   | false                             |

Once converted to JSON:  
```json
{
  "servers": [true,false]
}
```