import { Tools } from '@bettercorp/tools/lib/Tools';
import { IEmitter, PluginFeature, IPlugin } from "../../ILib";

export class Plugin implements IPlugin {
  init (features: PluginFeature): Promise<void> {
    return new Promise((resolve) => {
      // This function is called on plugin initialization
      features.onEvent(null, 'world', (data: IEmitter<number>) => {
        let ran: number = (!Tools.isNullOrUndefined(data.data)) ? data.data : new Date().getTime();

        if (ran % 2)
          // If the event returns data    
          return features.emitEvent(data.resultNames.plugin, data.resultNames.success, true);

        // If the event returns data but errors out
        features.emitEvent(data.resultNames.plugin, data.resultNames.success, false);
      });

      setTimeout(() => {
        features.emitEventAndReturn('hello', 'world')
          .then(features.log.warn)
          .catch(features.log.error);
        features.emitEventAndReturn('hello', 'world', 1)
          .then(features.log.warn)
          .catch(features.log.error);
        features.emitEventAndReturn('hello', 'world', 2)
          .then(features.log.warn)
          .catch(features.log.error);
      }, 2000);

      resolve();
    });
  }
}