import { EventEmitter } from 'events';
import { CEvents } from '../interfaces/events';

export default class emitAndReturn extends EventEmitter {
  private uSelf: CEvents;

  constructor(uSelf: CEvents) {
    super();
    this.uSelf = uSelf;
  }

  onReturnableEvent<ArgsDataType = any, ReturnDataType = any>(callerPluginName: string, pluginName: string, event: string, listener: { (data?: ArgsDataType): Promise<ReturnDataType>; }): void {
    this.uSelf.log.info(`EAR: ${ callerPluginName } listening to ${ pluginName || '_self' }-${ event }`);
    this.on(event, async (resolve, reject, data) => {
      try {
        return resolve(await listener(data));
      } catch (exc) {
        reject(exc);
      }
    });
  }

  emitReturnableEvent<ArgsDataType = any, ReturnDataType = any>(callerPluginName: string, pluginName: string, event: string, data?: ArgsDataType, timeout = 5): Promise<ReturnDataType> {
    this.uSelf.log.info(`EAR: ${ callerPluginName } emitting ${ pluginName || '_self' }-${ event }`);
    return new Promise((resolve, reject) => {
      let timeoutHandler = setTimeout(() => {
        reject('Timeout');
      }, timeout * 1000);
      this.emit(event, (args: ReturnDataType) => {
        clearTimeout(timeoutHandler);
        resolve(args);
      }, (args: ReturnDataType) => {
        clearTimeout(timeoutHandler);
        reject(args);
      }, data);
    });
  }
}