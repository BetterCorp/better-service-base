import { ServicesBase } from "../service/service";
import { ConfigBase } from "../config/config";
import { DefaultBase, FakeConfigBase } from "../interfaces/base";
import { IPluginConfig } from "../interfaces/config";
import { IServiceEvents } from "../interfaces/events";
import { RegisteredPlugin } from "../service/serviceClient";
import { IPluginLogger } from "../interfaces/logger";

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
      | RegisteredPlugin<any, any, any, any>,
    events: IServiceEvents<any, any>
  ): void {
    (plugin as unknown as IServiceEvents<any, any>).emitEvent =
      events.emitEvent;
    (plugin as unknown as IServiceEvents<any, any>).onEvent = events.onEvent;
    (plugin as unknown as IServiceEvents<any, any>).emitEventAndReturnTimed =
      events.emitEventAndReturnTimed;
    (plugin as unknown as IServiceEvents<any, any>).emitEventAndReturn =
      events.emitEventAndReturn;
    (plugin as unknown as IServiceEvents<any, any>).onReturnableEvent =
      events.onReturnableEvent;
    (plugin as unknown as IServiceEvents<any, any>).receiveStream =
      events.receiveStream;
    (plugin as unknown as IServiceEvents<any, any>).sendStream =
      events.sendStream;
  }
  static setupServicePlugin<PluginConfigType extends IPluginConfig = any>(
    plugin: ServicesBase<PluginConfigType>,
    events: IServiceEvents<any, any>,
    config: ConfigBase<PluginConfigType>,
    cwd: string,
    generateEventsForService: (
      pluginName: string,
      mappedPluginName: string
    ) => IServiceEvents<any, any>,
    generateLoggerForPlugin: { (pluginName: string): IPluginLogger }
  ): void {
    SBBase.setupServicePluginSpecific(plugin, events);
    (plugin as unknown as ServicesBase<any, any>).registerPluginClient = async (
      pluginName: string
    ): Promise<RegisteredPlugin<any, any, any, any>> => {
      let mappedPluginName = await config.getAppPluginMappedName(pluginName);
      let tPlugin = new RegisteredPlugin<any, any, any, any>(
        mappedPluginName,
        cwd,
        generateLoggerForPlugin(pluginName + "-client")
      );
      SBBase.setupServicePluginSpecific(
        tPlugin,
        generateEventsForService(pluginName, mappedPluginName)
      );
      return tPlugin;
    };
  }
}
