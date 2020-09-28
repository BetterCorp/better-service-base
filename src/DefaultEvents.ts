import { IEmitter, IEvents, IPluginLogger, PluginFeature } from "./ILib";
import * as EVENT_EMITTER from 'events';
import { v4 as UUID } from 'uuid';


export class DefaultEvents implements IEvents {
  private internalEvents: any;
  private logger!: IPluginLogger;

  init(feature: PluginFeature) {
    this.logger = feature.log;
    this.internalEvents = new (EVENT_EMITTER as any)();
    return this;
  }

  onEvent<T = any> (pluginName: string, event: string, global: Boolean, listener: (data: IEmitter<T>) => void): void {
    this.logger.info(pluginName, ` - LISTEN: [${global ? event : `${pluginName}-${event}`}]`);
    this.internalEvents.on(global ? event : `${pluginName}-${event}`, listener);
  }
  emitEvent<T = any> (pluginName: string, event: string, global: boolean, data?: T): void {
    this.logger.debug(pluginName, ` - EMIT: [${global ? event : `${pluginName}-${event}`}]`, data);
    this.internalEvents.emit(global ? event : `${pluginName}-${event}`, data);
  }
  emitEventAndReturn<T1 = any, T2 = any> (pluginName: string, event: string, endpointOrPluginName: string, data?: T1): Promise<void | T2> {
    this.logger.debug(pluginName, ` - EMIT AR: [${global ? event : `${pluginName}-${event}`}]`, data);
    let self = this;
    return new Promise((resolve, reject) => {
      const resultKey = UUID();
      const endEventName = `${endpointOrPluginName}-${event}-result-${resultKey}`;
      const errEventName = `${endpointOrPluginName}-${event}-error-${resultKey}`;

      let timeoutTimer = setTimeout(() => {
        if (timeoutTimer === null)
          return;
        self.internalEvents.removeListener(endEventName, () => { });
        self.internalEvents.removeListener(errEventName, () => { });
        this.logger.debug(pluginName, ` - EMIT AR: [${global ? event : `${pluginName}-${event}`}]`, 'TIMED OUT');
        reject(`NO RESPONSE IN TIME: ${endEventName} x${((data || {}) as any).timeoutSeconds || 10}s`);
      }, (((data || {}) as any).timeoutSeconds || 10) * 1000);
      self.internalEvents.once(errEventName, (data: Error | string | any) => {
        this.logger.debug(pluginName, ` - EMIT AR: [${global ? event : `${pluginName}-${event}`}]`, 'ERRORED', data);
        clearTimeout(timeoutTimer);
        self.internalEvents.removeListener(endEventName, () => { });
        self.internalEvents.removeListener(errEventName, () => { });
        reject(data);
      });
      self.internalEvents.once(endEventName, (data: T2 | any) => {
        this.logger.debug(pluginName, ` - EMIT AR: [${global ? event : `${pluginName}-${event}`}]`, 'SUCCESS', data);
        clearTimeout(timeoutTimer);
        self.internalEvents.removeListener(endEventName, () => { });
        self.internalEvents.removeListener(errEventName, () => { });
        resolve(data);
      });
      self.internalEvents.emit(`${endpointOrPluginName}-${event}`, {
        resultKey: resultKey,
        resultNames: {
          success: endEventName,
          error: errEventName
        },
        data: data
      });
    });
  }
}
