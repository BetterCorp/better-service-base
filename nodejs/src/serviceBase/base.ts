import { ServicesBase } from "../service/service";
import { ConfigBase } from "../config/config";
import { DefaultBase, FakeConfigBase } from "../interfaces/base";
import { IPluginConfig } from "../interfaces/config";
import { IServiceEvents } from "../interfaces/events";
import { RegisteredPlugin } from "../service/serviceClient";
import { IPluginLogger } from "../interfaces/logger";
import {
  DynamicallyReferencedMethod,
  DynamicallyReferencedMethodType,
} from "@bettercorp/tools/lib/Interfaces";

export class SBBase {
  static setupPlugin<PluginConfigType extends IPluginConfig = any>(
    appId: string,
    runningDebug: boolean,
    runningLive: boolean,
    plugin: DefaultBase<PluginConfigType>,
    config: ConfigBase<PluginConfigType>
  ): void {
    (plugin as unknown as FakeConfigBase).appId = appId;
    (plugin as unknown as FakeConfigBase).runningDebug = runningDebug;
    (plugin as unknown as FakeConfigBase).runningLive = runningLive;
    (plugin as unknown as FakeConfigBase).getPluginConfig =
      async (): Promise<PluginConfigType> => {
        return await config.getAppMappedPluginConfig(plugin.pluginName);
      };
    (plugin as unknown as FakeConfigBase).getPluginState =
      async (): Promise<boolean> => {
        return await config.getAppMappedPluginState(plugin.pluginName);
      };
  }

  static setupServicePluginSpecific<
    PluginConfigType extends IPluginConfig = any
  >(
    plugin:
      | ServicesBase<PluginConfigType>
      | RegisteredPlugin<any, any, any, any, any, any>,
    events: IServiceEvents<any, any, any, any>
  ): void {
    (plugin as unknown as IServiceEvents<any, any, any, any>).emitEvent =
      events.emitEvent;
    (plugin as unknown as IServiceEvents<any, any, any, any>).onEvent = events.onEvent;
    (plugin as unknown as IServiceEvents<any, any, any, any>).emitEventAndReturnTimed =
      events.emitEventAndReturnTimed;
    (plugin as unknown as IServiceEvents<any, any, any, any>).emitEventAndReturn =
      events.emitEventAndReturn;
    (plugin as unknown as IServiceEvents<any, any, any, any>).onReturnableEvent =
      events.onReturnableEvent;
    (plugin as unknown as IServiceEvents<any, any, any, any>).receiveStream =
      events.receiveStream;
    (plugin as unknown as IServiceEvents<any, any, any, any>).sendStream =
      events.sendStream;
  }
  static setupServicePlugin<PluginConfigType extends IPluginConfig = any>(
    plugin: ServicesBase<PluginConfigType>,
    events: IServiceEvents<any, any, any, any>,
    config: ConfigBase<PluginConfigType>,
    cwd: string,
    pluginCwd: string,
    generateEventsForService: (
      pluginName: string,
      mappedPluginName: string
    ) => IServiceEvents<any, any, any, any>,
    generateLoggerForPlugin: { (pluginName: string): IPluginLogger },
    log: IPluginLogger,
    callPluginMethod: {
      (pluginName: string, method: string, args: Array<any>): Promise<any>;
    }
  ): void {
    SBBase.setupServicePluginSpecific(plugin, events);
    (plugin as unknown as ServicesBase<any, any>).registerPluginClient = async (
      pluginName: string
    ): Promise<RegisteredPlugin<any, any, any, any, any, any>> => {
      let mappedPluginName = await config.getAppPluginMappedName(pluginName);
      log.debug(
        "Registering new plugin client in {callerPlugin} for {pluginName} as {mappedPluginName}",
        {
          callerPlugin: plugin.pluginName,
          pluginName,
          mappedPluginName,
        }
      );
      let tPlugin = new RegisteredPlugin<any, any, any, any, any, any>(
        pluginName,
        cwd,
        pluginCwd,
        generateLoggerForPlugin(pluginName + "-client")
      );
      SBBase.setupServicePluginSpecific(
        tPlugin,
        generateEventsForService(pluginName, mappedPluginName)
      );
      (
        tPlugin as unknown as RegisteredPlugin<any, any, any, any, any, any>
      ).callPluginMethod = async <TA extends string>(
        ...args: DynamicallyReferencedMethod<
          DynamicallyReferencedMethodType<any>,
          TA
        >
      ) => {
        const method = args.splice(0, 1)[0] as string;
        return await callPluginMethod(mappedPluginName, method, args);
      };
      return tPlugin;
    };
  }
}
