import { Tools } from '@bettercorp/tools/lib/Tools';
import { PluginFeature, IPlugin } from "../../ILib";

export class Plugin implements IPlugin {
  init (features: PluginFeature): Promise<void> {
    return new Promise((resolve) => {
      // This function is called on plugin initialization
      features.onReturnableEvent<number>(null, 'world', (resolve, reject, data: number) => {
        if (Tools.isNullOrUndefined(data))
          return reject('Data not defined!');

        resolve(data % 2);
      });

      setTimeout(() => {
        features.emitEventAndReturn('plugin-hello', 'world')
          .then(features.log.warn)
          .catch(features.log.error);
        features.emitEventAndReturn('plugin-hello', 'world', 1)
          .then(features.log.warn)
          .catch(features.log.error);
        features.emitEventAndReturn('plugin-hello', 'world', 2)
          .then(features.log.warn)
          .catch(features.log.error);
      }, 2000);

      resolve();
    });
  }
}