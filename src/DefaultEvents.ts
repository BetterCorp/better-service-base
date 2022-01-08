import { CEvents, IConfig, IPluginLogger } from "./ILib";
import { Readable } from 'stream';
import emit from './events/emit';
import emitAndReturn from './events/emitAndReturn';

export class Events extends CEvents {
  private emit!: emit;
  private ear!: emitAndReturn;

  constructor(pluginName: string, cwd: string, log: IPluginLogger, appConfig: IConfig) {
    super(pluginName, cwd, log, appConfig);
    this.emit = new emit(this);
    this.ear = new emitAndReturn(this);
  }

  async onEvent<ArgsDataType = any>(callerPluginName: string, pluginName: string, event: string, listener: (data: ArgsDataType) => void): Promise<void> {
    this.emit.onEvent<ArgsDataType>(callerPluginName, pluginName, event, listener);
  }
  async emitEvent<ArgsDataType = any>(callerPluginName: string, pluginName: string, event: string, data?: ArgsDataType): Promise<void> {
    this.emit.emitEvent<ArgsDataType>(callerPluginName, pluginName, event, data);
  }
  async onReturnableEvent<ArgsDataType = any, ResolveDataType = any, RejectDataType = any>(callerPluginName: string, pluginName: string, event: string, listener: { (resolve: { (data?: ResolveDataType, stream?: Readable): void; }, reject: { (error?: RejectDataType): void; }, data?: ArgsDataType, stream?: Readable): void; }): Promise<void> {
    this.ear.onReturnableEvent<ArgsDataType, ResolveDataType>(callerPluginName, pluginName, event, listener);
  }
  async emitEventAndReturn<ArgsDataType = any, ReturnDataType = any>(callerPluginName: string, pluginName: string, event: string, data?: ArgsDataType, timeoutSeconds?: number, stream?: Readable, streamTimeoutSeconds?: number): Promise<ReturnDataType> {
    return this.ear.emitReturnableEvent<ArgsDataType, ReturnDataType>(callerPluginName, pluginName, event, data, timeoutSeconds, stream, streamTimeoutSeconds);
  }
}
