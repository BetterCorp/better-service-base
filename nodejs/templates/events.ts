import { CEvents } from "@bettercorp/service-base/lib/interfaces/events";
import { MyPluginConfig } from './sec.config';

export class Events extends CEvents<MyPluginConfig> {
  init(): Promise<void> {
    return new Promise((resolve) => {
      resolve();
    });
  }

  async onEvent<ArgsDataType = any>(callerPluginName: string, pluginName: string, event: string, listener: { (data: ArgsDataType): Promise<void>; }): Promise<void> {
    throw 'onEvent not setup';
  }
  async emitEvent<ArgsDataType = any>(callerPluginName: string, pluginName: string, event: string, data?: ArgsDataType): Promise<void> {
    throw 'emitEvent not setup';
  }
  async onReturnableEvent<ArgsDataType = any>(callerPluginName: string, pluginName: string, event: string, listener: { (data: ArgsDataType): Promise<void>; }): Promise<void> {
    throw 'onReturnableEvent not setup';
  }
  async emitEventAndReturn<ArgsDataType = any, ReturnDataType = any>(callerPluginName: string, pluginName: string, event: string, data?: ArgsDataType, timeoutSeconds?: number): Promise<ReturnDataType> {
    throw 'emitEventAndReturn not setup';
  }
}
