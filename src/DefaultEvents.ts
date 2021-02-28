import { IEvents, IPluginLogger, PluginFeature } from "./ILib";
import * as EVENT_EMITTER from 'events';
import { v4 as UUID } from 'uuid';


export class Events implements IEvents {
  private internalEvents: any;
  private internalReturnableEvents: any;
  private logger!: IPluginLogger;

  init(feature: PluginFeature): Promise<void> {
    this.logger = feature.log;
    this.internalEvents = new (EVENT_EMITTER as any)();
    this.internalReturnableEvents = new (EVENT_EMITTER as any)();
    return new Promise((resolve) => resolve());
  }

  onEvent<T = any> (plugin: string, pluginName: string | null, event: string, listener: (data: T) => void): void {
    this.logger.info(plugin, ` - LISTEN: [${`${pluginName || plugin}-${event}`}]`);
    this.internalEvents.on(`${pluginName || plugin}-${event}`, listener);
  }
  emitEvent<T = any> (plugin: string, pluginName: string | null, event: string, data?: T): void {
    this.logger.debug(plugin, ` - EMIT: [${`${pluginName || plugin}-${event}`}]`, data);
    this.internalEvents.emit(`${pluginName || plugin}-${event}`, data);
  }
  onReturnableEvent<T = any> (plugin: string, pluginName: string | null, event: string, listener: (resolve: Function, reject: Function, data: T) => void): void {
    this.logger.info(plugin, ` - LISTEN EAR: [${`${pluginName || plugin}-${event}`}]`);
    this.internalReturnableEvents.on(`${pluginName || plugin}-${event}`, (data: any) => {
      listener((x: any) => {
        this.logger.debug(plugin, ` - RETURN OKAY: [${`${pluginName || plugin}-${event}`}]`, data);
        this.internalReturnableEvents.emit(data.resultNames.success, x);
      }, (x: any) => {
        this.logger.debug(plugin, ` - RETURN ERROR: [${`${pluginName || plugin}-${event}`}]`, data);
        this.internalReturnableEvents.emit(data.resultNames.error, x);
      }, data.data)
    });
  }
  emitEventAndReturn<T1 = any, T2 = void> (plugin: string, pluginName: string | null, event: string, data?: T1): Promise<T2> {
    this.logger.debug(plugin, ` - EMIT AR: [${`${pluginName || plugin}-${event}`}]`, data);
    let self = this;
    return new Promise((resolve, reject) => {
      const resultKey = UUID();
      const endEventName = `${event}-result-${resultKey}`;
      const fullEndEventName = `${pluginName || plugin}-${endEventName}`;
      const errEventName = `${event}-error-${resultKey}`;
      const fullErrEventName = `${pluginName || plugin}-${errEventName}`;

      let timeoutTimer: any = setTimeout(() => {
        if (timeoutTimer === null)
          return;
        self.internalReturnableEvents.removeListener(fullEndEventName, () => { });
        self.internalReturnableEvents.removeListener(fullErrEventName, () => { });
        this.logger.debug(plugin, ` - EMIT AR: [${`${pluginName || plugin}-${event}`}]`, 'TIMED OUT');
        reject(`NO RESPONSE IN TIME: ${pluginName || plugin}-${endEventName} x${((data || {}) as any).timeoutSeconds || 10}s`);
      }, (((data || {}) as any).timeoutSeconds || 10) * 1000);
      self.internalReturnableEvents.once(fullErrEventName, (data: Error | string | any) => {
        this.logger.debug(plugin, ` - EMIT AR: [${`${pluginName || plugin}-${event}`}]`, 'ERRORED', data);
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
        self.internalReturnableEvents.removeListener(fullEndEventName, () => { });
        self.internalReturnableEvents.removeListener(fullErrEventName, () => { });
        reject(data);
      });
      self.internalReturnableEvents.once(fullEndEventName, (data: T2 | any) => {
        this.logger.debug(plugin, ` - EMIT AR: [${`${pluginName || plugin}-${event}`}]`, 'SUCCESS', data);
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
        self.internalReturnableEvents.removeListener(fullEndEventName, () => { });
        self.internalReturnableEvents.removeListener(fullErrEventName, () => { });
        resolve(data);
      });
      self.internalReturnableEvents.emit(`${pluginName || plugin}-${event}`, {
        resultKey: resultKey,
        resultNames: {
          plugin: pluginName,
          success: fullEndEventName,
          error: fullErrEventName
        },
        data: data
      });
    });
  }
}
