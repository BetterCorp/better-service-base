---
lang: en-US
title: Event plugins
description: Event plugins for BSB
footer: Copyright © 2016-present BetterCorp (PTY) Ltd - All rights reserved
---

# BSB Config

## The `sec.config.json` file   

```json
{
  "identity": "development",
  "debug": true,
  "deploymentProfiles": {
    "default": {
      "events-rabbitmq": {
        "mappedName": "rabbitmq",
        "enabled": true
      }
    }
  },
  "plugins": {
    "rabbitmq": {
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

Plugins that contain an events definition and enabled in the deployment profile will be activated automatically.  

## Events/methods  

When `pluginName` is set to null, the current plugin name is used.  

### Fire and forget

Listen to events: 
```ts  
// this.onEvent<ArgsDataType = any>(pluginName: string, event: string, listener: { (data: ArgsDataType): Promise<void>; });
this.onEvent<string>(null, "on-event", (data) => {
  // this event runs when emitEvent is called with the same plugin name and event
  console.log(data); // output: "THIS IS A TEST"
});
```

Trigger the events:  
```ts  
//emitEvent<ArgsDataType = any>(pluginName: string, event: string, data?: ArgsDataType);
emitEvent<string>(null, "on-event", "THIS IS A TEST");
```

### Get reply

Listen to returnable events: 
```ts  
// this.onEvent<ArgsDataType = any>(pluginName: string, event: string, listener: { (data: ArgsDataType): Promise<void>; });
this.onReturnableEvent<string, boolean>(null, "on-returnable-event", async (data?) => { // this is an async/promise  
  // this event runs when emitEvent is called with the same plugin name and event
  console.log(data); // output: "THIS IS A TEST"
  return true;
});
```

Trigger the events:  
```ts  
//emitEvent<ArgsDataType = any>(pluginName: string, event: string, data?: ArgsDataType);
console.log(await emitReturnableEvent<string>(null, "on-returnable-event", "THIS IS A TEST")); // output: true
```

### Send/Receive a stream

Ready the events plugin to do a stream transfer: 
```ts  
// this.receiveStream(callerPluginName: string, listener: { (error: Error | null, stream: Readable): Promise<void>; }, timeoutSeconds: number = 60): Promise<string>
let streamId = await this.receiveStream(null, "on-event", async (error: Error | null, stream: Readable) => { // this is an async/promise  
  // do stuff with the stream
});
// emit the stream ID to to origin service to start the stream
```

Send the stream to the receiver:  
```ts  
//sendStream(callerPluginName: string, streamId: string, stream: Readable): Promise<void>
await sendStream(streamId, stream); 
// stream ID from the receiveStream and stream from the item you want to stream  
```


## BSB Config Plugins

### [RabbitMQ](/Events/RabbitMQ)
### [PubNub](/Events/PubNub)

