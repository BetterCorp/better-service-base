import { CEvents } from "./ILib";
import * as EVENT_EMITTER from "events";
import { v4 } from "uuid";


export class Events extends CEvents {
  private internalEvents: any;
  private internalReturnableEvents: any;

  init(): Promise<void> {
    this.internalEvents = new (EVENT_EMITTER as any)();
    this.internalReturnableEvents = new (EVENT_EMITTER as any)();
    return new Promise((resolve) => resolve());
  }

  onEvent<ArgsDataType = any>(callerPluginName: string, pluginName: string, event: string, listener: (data: ArgsDataType) => void): void {
    this.log.info(callerPluginName, ` - LISTEN: [${ `${ pluginName }-${ event }` }]`);
    this.internalEvents.on(`${ pluginName }-${ event }`, listener);
  }
  emitEvent<ArgsDataType = any>(callerPluginName: string, pluginName: string, event: string, data?: ArgsDataType): void {
    this.log.debug(callerPluginName, ` - EMIT: [${ `${ pluginName }-${ event }` }]`, data);
    this.internalEvents.emit(`${ pluginName }-${ event }`, data);
  }
  onReturnableEvent<ArgsDataType = any>(callerPluginName: string, pluginName: string, event: string, listener: (resolve: Function, reject: Function, data: ArgsDataType) => void): void {
    const self = this;
    self.log.info(callerPluginName, ` - LISTEN EAR: [${ `${ pluginName }-${ event }` }]`);
    self.internalReturnableEvents.on(`${ pluginName }-${ event }`, (data: any) => {
      listener((x: any) => {
        self.log.debug(callerPluginName, ` - RETURN OKAY: [${ `${ pluginName }-${ event }` }]`, data);
        self.internalReturnableEvents.emit(data.resultNames.success, x);
      }, (x: any) => {
        self.log.debug(callerPluginName, ` - RETURN ERROR: [${ `${ pluginName }-${ event }` }]`, data);
        self.internalReturnableEvents.emit(data.resultNames.error, x);
      }, data.data);
    });
  }
  emitEventAndReturn<ArgsDataType = any, ReturnDataType = any>(callerPluginName: string, pluginName: string, event: string, data?: ArgsDataType, timeoutSeconds?: number): Promise<ReturnDataType> {
    let self = this;
    self.log.debug(callerPluginName, ` - EMIT AR: [${ `${ pluginName }-${ event }` }]`, data);
    return new Promise((resolve, reject) => {
      const resultKey = v4();
      const endEventName = `${ event }-result-${ resultKey }`;
      const fullEndEventName = `${ pluginName }-${ endEventName }`;
      const errEventName = `${ event }-error-${ resultKey }`;
      const fullErrEventName = `${ pluginName }-${ errEventName }`;

      let timeoutTimer: any = setTimeout(() => {
        if (timeoutTimer === null)
          return;
        self.internalReturnableEvents.removeListener(fullEndEventName, () => { });
        self.internalReturnableEvents.removeListener(fullErrEventName, () => { });
        self.log.debug(callerPluginName, ` - EMIT AR: [${ `${ pluginName }-${ event }` }]`, "TIMED OUT");
        reject(`NO RESPONSE IN TIME: ${ pluginName }-${ endEventName } x${ timeoutSeconds || 10 }s`);
      }, (timeoutSeconds || 10) * 1000);
      self.internalReturnableEvents.once(fullErrEventName, (data: Error | string | any) => {
        self.log.debug(callerPluginName, ` - EMIT AR: [${ `${ pluginName }-${ event }` }]`, "ERRORED", data);
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
        self.internalReturnableEvents.removeListener(fullEndEventName, () => { });
        self.internalReturnableEvents.removeListener(fullErrEventName, () => { });
        reject(data);
      });
      self.internalReturnableEvents.once(fullEndEventName, (data: ReturnDataType | any) => {
        self.log.debug(callerPluginName, ` - EMIT AR: [${ `${ pluginName }-${ event }` }]`, "SUCCESS", data);
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
        self.internalReturnableEvents.removeListener(fullEndEventName, () => { });
        self.internalReturnableEvents.removeListener(fullErrEventName, () => { });
        resolve(data);
      });
      self.internalReturnableEvents.emit(`${ pluginName }-${ event }`, {
        resultKey,
        resultNames: {
          plugin: pluginName,
          success: fullEndEventName,
          error: fullErrEventName
        },
        data
      });
    });
  }
}
