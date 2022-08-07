---
lang: en-US
title: PubNub Plugin
description: PubNub events plugin for BSB
footer: Copyright © 2016-present BetterCorp (PTY) Ltd - All rights reserved
---

# PubNub events plugin

## Setting up PubNub

Go to pubnub.com and create a new app and key.  

## Setting up BSB

### PubNub plugin config  

```json
"events-pubnub": {
  "subscribeKey": "sub-c-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

By not defining a publishKey, the events plugin will only listen to events from pubnub, and not publish any events up.  
It will use the default events handler for all other events (thill will be moved directly into the BSB at a later stage, and to allow more control over events).  

Channels/subscriptions and events are handled automatically.  
