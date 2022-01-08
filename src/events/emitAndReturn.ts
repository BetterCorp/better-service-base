import { EventEmitter } from 'events';
import { CEvents } from '../ILib';
import { Readable } from 'stream';

export default class emitAndReturn extends EventEmitter {
  private uSelf: CEvents;

  constructor(uSelf: CEvents) {
    super();
    this.uSelf = uSelf;
  }

  onReturnableEvent<ArgsDataType = any, ResolveDataType = any, RejectDataType = any>(callerPluginName: string, pluginName: string, event: string, listener: { (resolve: { (data?: ResolveDataType, stream?: Readable): void; }, reject: { (error?: RejectDataType): void; }, data?: ArgsDataType, stream?: Readable): void; }): void {
    this.uSelf.log.info(`EAR: ${ callerPluginName } listening to ${ pluginName || '_self' }-${ event }`);
    this.on(event, listener);
  }

  emitReturnableEvent<ArgsDataType = any, ReturnDataType = any>(callerPluginName: string, pluginName: string, event: string, data?: ArgsDataType, timeout = 5, stream?: Readable, streamTimeoutSeconds: number = 60): Promise<ReturnDataType> {
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