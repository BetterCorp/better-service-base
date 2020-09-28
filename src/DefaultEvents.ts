import { IEmitter, IEvents, IPluginLogger, PluginFeature } from "./ILib";
import * as EVENT_EMITTER from 'events';
import { v4 as UUID } from 'uuid';


export class Events implements IEvents {
  private internalEvents: any;
  private logger!: IPluginLogger;

  init(feature: PluginFeature): Promise<void> {
    this.logger = feature.log;
    this.internalEvents = new (EVENT_EMITTER as any)();
    return new Promise((resolve) => resolve());
  }

  onEvent<T = any> (plugin: string, pluginName: string | null, event: string, listener: (data: IEmitter<T>) => void): void {
    this.logger.info(plugin, ` - LISTEN: [${`${pluginName || plugin}-${event}`}]`);
    this.internalEvents.on(`${pluginName || plugin}-${event}`, listener);
  }
  emitEvent<T = any> (plugin: string, pluginName: string | null, event: string, data?: T): void {
    this.logger.debug(plugin, ` - EMIT: [${`${pluginName || plugin}-${event}`}]`, data);
    this.internalEvents.emit(`${pluginName || plugin}-${event}`, data);
  }
  emitEventAndReturn<T1 = any, T2 = any> (plugin: string, pluginName: string | null, event: string, data?: T1): Promise<void | T2> {
    this.logger.debug(plugin, ` - EMIT AR: [${`${pluginName || plugin}-${event}`}]`, data);
    let self = this;
    return new Promise((resolve, reject) => {
      const resultKey = UUID();
      const endEventName = `${event}-result-${resultKey}`;
      const fullEndEventName = `${pluginName || plugin}-${endEventName}`;
      const errEventName = `${event}-error-${resultKey}`;
      const fullErrEventName = `${pluginName || plugin}-${errEventName}`;

      let timeoutTimer = setTimeout(() => {
        if (timeoutTimer === null)
          return;
        self.internalEvents.removeListener(fullEndEventName, () => { });
        self.internalEvents.removeListener(fullErrEventName, () => { });
        this.logger.debug(plugin, ` - EMIT AR: [${`${pluginName || plugin}-${event}`}]`, 'TIMED OUT');
        reject(`NO RESPONSE IN TIME: ${pluginName || plugin}-${endEventName} x${((data || {}) as any).timeoutSeconds || 10}s`);
      }, (((data || {}) as any).timeoutSeconds || 10) * 1000);
      self.internalEvents.once(fullErrEventName, (data: Error | string | any) => {
        this.logger.debug(plugin, ` - EMIT AR: [${`${pluginName || plugin}-${event}`}]`, 'ERRORED', data);
        clearTimeout(timeoutTimer);
        self.internalEvents.removeListener(fullEndEventName, () => { });
        self.internalEvents.removeListener(fullErrEventName, () => { });
        reject(data);
      });
      self.internalEvents.once(fullEndEventName, (data: T2 | any) => {
        this.logger.debug(plugin, ` - EMIT AR: [${`${pluginName || plugin}-${event}`}]`, 'SUCCESS', data);
        clearTimeout(timeoutTimer);
        self.internalEvents.removeListener(fullEndEventName, () => { });
        self.internalEvents.removeListener(fullErrEventName, () => { });
        resolve(data);
      });
      self.internalEvents.emit(`${pluginName || plugin}-${event}`, {
        resultKey: resultKey,
        resultNames: {
          plugin: pluginName,
          success: endEventName,
          error: errEventName
        },
        data: data
      });
    });
  }
}
