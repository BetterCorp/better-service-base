import { ConfigBase } from '../config/config';
import { DefaultBase, FakeConfigBase } from '../interfaces/base';
import { IPluginConfig } from '../interfaces/config';

export class SBBase {
  static setupPlugin<PluginConfigType extends IPluginConfig = any>(plugin: DefaultBase<PluginConfigType>, config: ConfigBase): void {
    (plugin as unknown as FakeConfigBase).runningDebug = config.runningDebug;
    (plugin as unknown as FakeConfigBase).runningLive = config.runningLive;
    (plugin as unknown as FakeConfigBase).getPluginConfig = async (): Promise<PluginConfigType> => {
      return await config.getPluginConfig(plugin.pluginName);
    }
    (plugin as unknown as FakeConfigBase).getPluginState = async (): Promise<boolean> => {
      return await config.getPluginState(plugin.pluginName);
    }
  }
}