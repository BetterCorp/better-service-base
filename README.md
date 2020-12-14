# Service base for distributed Services

This base allows for a distributed service platform.  
  
# Plugins

Create ts/js files according to your new plugin:  

```src/<plugin-name>/plugin.ts```  

```lib/<plugin-name>/plugin.js```  

# TODO: This readme needs to be updated

# Core plugins

## Logger  
```src/logging/plugin.ts```  

```typescript
exports.default = {
  info: (pluginName: string, ...data: any[]) => typeof data === 'string'  
    ? console.log(`[${pluginName.toUpperCase()}] ${data}`)  
    : console.log(pluginName.toUpperCase(), data),  
  error: (pluginName: string, ...data: any[]) => typeof data === 'string'  
    ? console.error(`[${pluginName.toUpperCase()}] ${data}`)  
    : console.error(pluginName.toUpperCase(), data),  
  warn: (pluginName: string, ...data: any[]) => typeof data === 'string'  
    ? console.warn(`[${pluginName.toUpperCase()}] ${data}`)  
    : console.warn(pluginName.toUpperCase(), data)  
}  
```  

# New plugin  
```src/<plugin-name>/plugin.ts```  

```typescript
module.exports.init = (features: PluginFeature) => {
  // This function is called on plugin initialization
   
  features.onEvent('<event-name>', '<plugin-name>', (...args: any[]) => {
    if (args.length === 0) return;
    let objectOfInfo: any = args[0];

    // *objectOfInfo* is the data passed in to your event handler

    // If the event returns data    
    features.emitEvent(`<plugin-name>-<event-name>-result-${objectOfInfo.resultKey}`, '<result data object or string>');

    // If the event returns data but errors out
    features.emitEvent(`<plugin-name>-<event-name>-error-${objectOfInfo.resultKey}`, '<error message or string>');
  });
}
```  

# Pre-built plugins

```@bettercorp/service-base-plugin-<plugin>```

# Using the base

```typescript
import ServiceBase from '@bettercorp/service-base';

const SB = new ServiceBase();
SB.init();
SB.run();
```