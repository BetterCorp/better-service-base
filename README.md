# Better-Service-base for distributed Micro-Services

This base allows for easy distributed service platform development.  
  
## Getting started

Create a new npm repo (in a new empty directory) ```npm init -y``` - ignore this step if you already have a project  
  
Then run the following command to install the BSB  
```npm i --save @bettercorp/service-base```  
  
On installation, we will automatically bootstrap your project for you.  
  
You can view a list of plugins available here: [https://bsb.betterweb.co.za/packages/](https://bsb.betterweb.co.za/packages/)  
  
## Creating your own plugin
  
Open command prompt/bash/terminal in the plugin directory.  
  
Run the following command:  
```npm run create -- -t {your plugin type} -n {your plugin name} ```  
You can type ```npm run create -- --help``` to view the cli help.  
  
Plugin names must not contain any spaces.  
###Plugin types: 
 - ```plugin``` (a standard plugin)
 - ```logger``` (a logger plugin to extend the logging capabilities of BSB - eg: SYSLOG)
 - ```events``` (an events plugin to extend the BSB event bus with different event services - eg: rabbitMQ)
  
## Publishing notes
  
As long as you have installed the service base as per the getting started, if you npm install your package, BSB will find your package and ready it for use.  
  
## Running the plugin

Development: ```npm run dev```  
Live: ```npm run start```  
Build package: ```npm run build```