import { Tools } from '@bettercorp/tools/lib/Tools';
import { PluginFeature } from "../../ILib";

module.exports.init = (features: PluginFeature) => {
  // This function is called on plugin initialization
  features.onEvent('world', null, (...args: any[]) => {
    if (args.length === 0) return;
    let objectOfInfo: any = args[0];

    let ran = (!Tools.isNullOrUndefined(objectOfInfo)) ? objectOfInfo : new Date().getTime();

    if (ran % 2)
      // If the event returns data    
      return features.emitEvent(`hello-world-result-${objectOfInfo.resultKey}`, true);

    // If the event returns data but errors out
    features.emitEvent(`hello-world-error-${objectOfInfo.resultKey}`, false);
  }, false);

  setTimeout(() => {
    features.emitEventAndReturn('world', 'hello', undefined, null)
      .then(features.log.warn)
      .catch(features.log.error);
  }, 2000);
};
