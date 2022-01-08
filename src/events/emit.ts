import { EventEmitter } from 'events';
import { CEvents } from '../interfaces/events';

export default class emit extends EventEmitter {
  private uSelf: CEvents;

  constructor(uSelf: CEvents) {
    super();
    this.uSelf = uSelf;
  }

  onAllEvents(callerPluginName: string, listener: (data: any) => void) {
    this.uSelf.log.info(`EMIT: ${ callerPluginName } listening to *`);
    this.on('*', listener);
  }

  onEvent<ArgsDataType = any>(callerPluginName: string, pluginName: string, event: string, listener: (data: ArgsDataType) => void) {
    this.uSelf.log.info(`EMIT: ${ callerPluginName } listening to ${ pluginName || '_self' }-${ event }`);
    this.on(`${ pluginName || callerPluginName }-${ event }`, listener);
  }

  emitEvent<ArgsDataType = any>(callerPluginName: string, pluginName: string, event: string, data?: ArgsDataType) {
    this.uSelf.log.info(`EMIT: ${ callerPluginName } emitting ${ pluginName || '_self' }-${ event }`);
    this.emit(`${ pluginName || callerPluginName }-${ event }`, data);
  }
}