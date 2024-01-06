---
title: "Basics"
date: 2023-07-27T13:03:00+02:00
weight: 1
draft: false
type : "single"
---

###### Events plugins  

These plugins are used to connect the BSB to your events broker.  
An example would be: `rabbitMQ`

###### Logging plugins  

These plugins are used to connect an external logging platform.
An example would be: `graylog`

###### Config plugins  

These plugins allow you to connect an external configuration service for the BSB.  
An example would be: `1password`


###### Service plugins  

These plugins are the main code, the secret sauce of the BSB.  
You'll write your code in these for the actual logic.  
An example would be: `fastify` or `express`


###### PDK

PDK is the Plugin Development Kit


{{< notice "tip" >}}
The PDK is an app to configure and manage the BSB.  
We did this because it is much easier than doing it in a CLI because of the options/choices available. - [see more](/pdk)  
{{< /notice >}}
