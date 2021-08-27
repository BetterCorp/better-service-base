import { CEvents } from "@bettercorp/service-base/lib/ILib";
import { MyPluginConfig } from './sec.config';

export class Events extends CEvents<MyPluginConfig> {
  init(): Promise<void> {
    return new Promise((resolve) => {
      resolve()
    });
  }

  onEvent<ArgsDataType = any>(callerPluginName: string, pluginName: string, event: string, listener: (data: ArgsDataType) => void): void {
    throw 'onEvent not setup';
  }
  emitEvent<ArgsDataType = any>(callerPluginName: string, pluginName: string, event: string, data?: ArgsDataType): void {
    throw 'emitEvent not setup';
  }
  onReturnableEvent<ArgsDataType = any>(callerPluginName: string, pluginName: string, event: string, listener: (resolve: Function, reject: Function, data: ArgsDataType) => void): void {
    throw 'onReturnableEvent not setup';
  }
  emitEventAndReturn<ArgsDataType = any, ReturnDataType = any>(callerPluginName: string, pluginName: string, event: string, data?: ArgsDataType, timeoutSeconds?: number): Promise<ReturnDataType> {
    throw 'emitEventAndReturn not setup';
  }
}
