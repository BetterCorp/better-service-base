import { Readable } from 'stream';
import { IConfig } from '../interfaces/config';
import { CEvents } from '../interfaces/events';
import { IPluginLogger } from '../interfaces/logger';
import emit from './emit';
import emitAndReturn from './emitAndReturn';
import emitStreamAndReceiveStream from './emitStreamAndReceiveStream';

export class Events extends CEvents {
  private emit!: emit;
  private ear!: emitAndReturn;
  private eas!: emitStreamAndReceiveStream;

  constructor(pluginName: string, cwd: string, log: IPluginLogger, appConfig: IConfig) {
    super(pluginName, cwd, log, appConfig);
    this.emit = new emit(this);
    this.ear = new emitAndReturn(this);
    this.eas = new emitStreamAndReceiveStream(this);
  }

  async onEvent<ArgsDataType = any>(callerPluginName: string, pluginName: string, event: string, listener: { (data: ArgsDataType): Promise<void>; }): Promise<void> {
    this.emit.onEvent<ArgsDataType>(callerPluginName, pluginName, event, listener);
  }
  async emitEvent<ArgsDataType = any>(callerPluginName: string, pluginName: string, event: string, data?: ArgsDataType): Promise<void> {
    this.emit.emitEvent<ArgsDataType>(callerPluginName, pluginName, event, data);
  }
  async onReturnableEvent<ArgsDataType = any, ReturnDataType = any>(callerPluginName: string, pluginName: string, event: string, listener: { (data?: ArgsDataType): Promise<ReturnDataType>; }): Promise<void> {
    this.ear.onReturnableEvent<ArgsDataType, ReturnDataType>(callerPluginName, pluginName, event, listener);
  }
  async emitEventAndReturn<ArgsDataType = any, ReturnDataType = any>(callerPluginName: string, pluginName: string, event: string, data?: ArgsDataType, timeoutSeconds?: number): Promise<ReturnDataType> {
    return this.ear.emitReturnableEvent<ArgsDataType, ReturnDataType>(callerPluginName, pluginName, event, data, timeoutSeconds);
  }
  async receiveStream(callerPluginName: string, listener: { (error: Error | null, stream: Readable): Promise<void>; }, timeoutSeconds?: number): Promise<string> {
    return this.eas.receiveStream(callerPluginName, listener, timeoutSeconds);
  }
  async sendStream(callerPluginName: string, streamId: string, stream: Readable): Promise<void> {
    return this.eas.sendStream(callerPluginName, streamId, stream);
  }
}
