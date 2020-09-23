import { Tools } from '@bettercorp/tools/lib/Tools';
import { IEmitter, PluginFeature } from "../../ILib";

module.exports.init = (features: PluginFeature) => {
  // This function is called on plugin initialization
  features.onEvent('world', false, (data: IEmitter<number>) => {
    let ran: number = (!Tools.isNullOrUndefined(data.data)) ? data.data : new Date().getTime();

    if (ran % 2)
      // If the event returns data    
      return features.emitEvent(data.resultNames.success, false, true);

    // If the event returns data but errors out
    features.emitEvent(data.resultNames.success, false, false);
  });

  setTimeout(() => {
    features.emitEventAndReturn('world', 'hello')
      .then(features.log.warn)
      .catch(features.log.error);
    features.emitEventAndReturn('world', 'hello', 1)
      .then(features.log.warn)
      .catch(features.log.error);
    features.emitEventAndReturn('world', 'hello', 2)
      .then(features.log.warn)
      .catch(features.log.error);
  }, 2000);
};
