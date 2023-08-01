---
title: "Architecture"
date: 2023-07-27T13:03:00+02:00
weight: 2
draft: false
type : "docs"
---

##### Single container/service
![Arch 1](https://content.betterweb.co.za/better-service-base/BSB-def-2.drawio.svg)  
  
<br />
<br />
<br />
  
##### 3 container cluster
Frontend contains the entrypoint/API  
The scheduler never scales to more than 1 running container - this handles all the scheduled tasks  
The backend container handles the logic, so called backend code    
![Arch 1](https://content.betterweb.co.za/better-service-base/BSB-Def-1.drawio.svg)  

<br />
<br />
<br />
  
##### Fully scaled cluster
Each container has a single service and can be individually scaled up/down

![Arch 1](https://content.betterweb.co.za/better-service-base/BSB-def-3.drawio.svg)  

<br />
<br />
  
Example with scaled containers (`4x frontend containers`)
![Arch 1](https://content.betterweb.co.za/better-service-base/BSB-def-4.drawio.svg)  
