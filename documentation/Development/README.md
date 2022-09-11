---
lang: en-US
title: Getting Started
description: Using the BSB
footer: Copyright © 2016-present BetterCorp (PTY) Ltd - All rights reserved
---

# BSB Getting Started  

## About  

The BSB is designed to be setup in a blank repo/project and cannot be added to an existing project.  

## Getting started  

### Init a new npm project

```bash
npm init -y 
```

### Install the BSB library

```bash
npm i --save @bettercorp/service-base
```  

This will setup your projects folder structure, add required config files and import basic plugins required to function.  
If you were to run `npm run dev` right now, it would run, but do nothing.  


## Example project  

Now we need to decide what we are going to do. So for this example, we'll setup a hello world web server that displays the time.  
To display the events based architecture, we're going to run 2 microservices (although we wont use an events plugin like rabbitMQ, that could be added easily).  
  
### Create plugins  

So let's create our new plugins, one for the frontend, which will receive the web requests, and the other that gets the time, and returns it.  
```bash
npm run create -- -n frontend;
npm run create -- -n backend;
```

This would have created 2 folders inside `src/plugins/` for your 2 services.  

### Install other plugins  

Let's now quickly install the webserver plugin (which will handle all the setup work for us)  

```bash
npm i --save @bettercorp/service-base-plugin-web-server
```  

### Working with plugins  

Let's start on the frontend code first.  
We're going to remove the client code, since nothing will be using it here. (you could turn it into an API lib if you wanted too though...)   
Plugin file: `src/plugins/frontend/plugin.ts`  

```ts
export class frontend extends CPluginClient<any> {
  public readonly _pluginName: string = "frontend";

  async triggerServerOnEvent(data: any): Promise<void> {
    await this.emitEvent("exampleOnEvent", data);
  }
  async triggerServerMethod(data: any): Promise<any> {
    return this.emitEventAndReturn("exampleServerMethod", data);
  }
}
```
^ Remove this code (Don't forget to remove the `CPluginClient` reference from the imports).  

We're also going to remove the example methods in the class, clean the init method and remove the loaded method.  

You should have something looking like this now:  
```ts
import { CPlugin } from "@bettercorp/service-base/lib/interfaces/plugins";
import { MyPluginConfig } from './sec.config';

export class Plugin extends CPlugin<MyPluginConfig> {
  async init(): Promise<void> {
    
  }
}
```

We're now going to import fastify (as per it's documentation)  

```ts
import { CPlugin } from "@bettercorp/service-base/lib/interfaces/plugins";
import { MyPluginConfig } from './sec.config';
import { fastify } from '@bettercorp/service-base-plugin-web-server/lib/plugins/fastify/fastify';

export class Plugin extends CPlugin<MyPluginConfig> {
  private fastify!: fastify;
  async init(): Promise<void> {
    this.fastify = new fastify(this);

    this.fastify.get('/', (req, reply) => {
      
    })
  }
}
```
We've also just created a blank default method for the get request `/`.  
We'll add code here later.

Now let's look at the backend plugin.  
Plugin file: `src/plugins/backend/plugin.ts`  

This one, we're going to keep the client, but we're going to clean it all up like we did for the frontend plugin.  

```ts
import { CPlugin, CPluginClient } from "@bettercorp/service-base/lib/interfaces/plugins";
import { MyPluginConfig } from './sec.config';

export class backend extends CPluginClient<any> {
  public readonly _pluginName: string = "backend";

}

export class Plugin extends CPlugin<MyPluginConfig> {
  async init(): Promise<void> {

  }
}
```

Now we've got a nice clean plugin, and lib.  
Let's add code.  

So start with the plugin, we're going to add a returnable method that will take in a date (as number) and output it as a formatted string.  

```ts
import { CPlugin, CPluginClient } from "@bettercorp/service-base/lib/interfaces/plugins";
import { MyPluginConfig } from './sec.config';
import { Tools } from '@bettercorp/tools/lib/Tools';

export class Plugin extends CPlugin<MyPluginConfig> {
  async init(): Promise<void> {
    this.onReturnableEvent<number, string>(null, "get-formatted-date", async (data?) => {
      if (!Tools.isNumber(data)) throw 'Invalid data';
      return new Date(data!).toISOString();
    });
  }
}
```
You can see we have also made use of our tool lib.  

Now what we have done is added a method that will call the callback function when an event is triggered on this plugin.  
`null` - denotes this plugin and `get-formatted-date` denotes the event name.  

Now we create a method to call the method we created on the plugin above.  

```ts 
export class backend extends CPluginClient<any> {
  public readonly _pluginName: string = "backend";

  public async getFormattedDate(date: number): Promise<string> {
    return this.emitEventAndReturn<number, string>("get-formatted-date", date);
  }
}
```

This plugin will emit events on the plugin name defined by `_pluginName` - and that name will automatically be mapped if defined in the config.  


Now lets go back to the frontend and use the code.  
We will do the same import and setup as we did for fastify, but for the client lib.  

```ts
import { CPlugin } from "@bettercorp/service-base/lib/interfaces/plugins";
import { MyPluginConfig } from './sec.config';
import { fastify } from '@bettercorp/service-base-plugin-web-server/lib/plugins/fastify/fastify';
import { backend } from '../backend/plugin';

export class Plugin extends CPlugin<MyPluginConfig> {
  private fastify!: fastify;
  private backend!: backend;
  async init(): Promise<void> {
    this.fastify = new fastify(this);
    this.backend = new backend(this);

    this.fastify.get('/', (req, reply) => {

    })
  }
}
```

So now we've added the import and setup for the backend and fastify, but it doesn't really do anything ...  
So let's make it use the backend and work.   

```ts 
import { CPlugin } from "@bettercorp/service-base/lib/interfaces/plugins";
import { MyPluginConfig } from './sec.config';
import { fastify } from '@bettercorp/service-base-plugin-web-server/lib/plugins/fastify/fastify';
import { backend } from '../backend/plugin';

export class Plugin extends CPlugin<MyPluginConfig> {
  private fastify!: fastify;
  private backend!: backend;
  async init(): Promise<void> {
    this.fastify = new fastify(this);
    this.backend = new backend(this);

    const self = this;
    this.fastify.get('/', (req, reply) => {
      const now = new Date().getTime();
      self.backend.getFormattedDate(now).then(formattedDate => {
        reply.send(formattedDate);
      }).catch(self.log.error);
    });
  }
}
```

Ok, so we've got it all setup, but like, nothing works - what gives?  

Well you have to configure the services to function first... 

### Configure plugins  

Let's head over to our `sec.config.json` file to do just that.  

So lets first configure the plugins (mainly fastify here).  

So fastify should be ready to go off the bat, but you may have port issues, so let's just change the `httpPort` under `plugins`/`fastify`  
Let's set it too `3008` for now, since that should be an option port (otherwise pick an open port...)  

Now we've configured fastify, it still work work... we have to enable the plugins now.  

Under `deploymentProfiles`/`default` (since we're not using a custom profile), we want to enable `frontend`, `backend` and `fastify`.  
Change `"enabled": false` to `"enabled": true` for each plugin.  

Your `sec.config.json` file will look something like this now: 

```json
{
  "identity": "myhost",
  "debug": true,
  "deploymentProfiles": {
    "default": {
      "frontend": {
        "mappedName": "frontend",
        "enabled": true
      },
      "backend": {
        "mappedName": "backend",
        "enabled": true
      },
      "fastify": {
        "mappedName": "fastify",
        "enabled": true
      }
    }
  },
  "plugins": {
    "frontend": {},
    "backend": {},
    "fastify": {
      "host": "0.0.0.0",
      "httpPort": 3008,
      "ipRewrite": true,
      "server": "http",
      "httpToHttpsRedirect": true,
      "httpsPort": 443,
      "httpsCert": null,
      "httpsKey": null,
      "cors": {
        "enabled": false,
        "options": {
          "origin": true,
          "allowedHeaders": "content-type",
          "methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          "credentials": false,
          "maxAge": 13000,
          "preflightContinue": false,
          "optionsSuccessStatus": 200,
          "preflight": true,
          "strictPreflight": false
        }
      },
      "rateLimit": {
        "enabled": false,
        "options": {
          "max": 500,
          "timeWindow": "15 minute"
        }
      }
    }
  }
}
```

It will contain other entries, like express/webJWT, but we can ignore them for the demo.  

### Demo  

Now go and browse `http://localhost:3008/` on your PC and you should see the date return.  

### Different Event Bus

If we wanted to add rabbitMQ, all you would have to do is install the plugin  
```bash
npm i --save @bettercorp/service-base-plugin-events-rabbitmq
```  

Then `npm run dev` or `npm run build` in case it hasn't updated your config file already.  

Define the rabbitMQ config in the `plugins`/`events-rabbitmq` configuration according to your rabbit instance.  
And enable the `events-rabbitmq` plugin under deploymentProfiles.  
The platform will automatically start using rabbitMQ for all events.  


## Publishing  

Publish your newly created package to npm, and you can install it in other services (to make use of the client) or to deploy in containers.  
When the BSB starts up, it looks through your `node_modules` directory (2 levels deep) to find any packages with `"bsb_project": true` defined in their `package.json` file.  
So if you `npm i my-package` into another service, you are able to run your service/use it.  

## Deployment  

Spin up a docker nodeJS image, and create a npm project within the container.  
`npm i` your package and define a `sec.config.json` file (or use the available config plugins - don't forget to install them).  
You can now run your docker container with your service in it - or you could run multiple of the same containers (if you have multiple services in a single project - this is where deployment profiles help)  