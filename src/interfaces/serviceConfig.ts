import { ErrorMessages } from "./static";
import { IPluginConfig } from "./config";

export class pluginConfig {
  static getConfig(
    pluginName: string,
    existingConfig?: IPluginConfig
  ): IPluginConfig {
    throw ErrorMessages.PluginConfigNotSetupToGenerateConfig;
  }
}

export class SecConfig<MyPluginConfig extends IPluginConfig = any> {
  public migrate(
    mappedPluginName: string,
    existingConfig: MyPluginConfig | null
  ): MyPluginConfig {
    throw ErrorMessages.BSBNotInit;
  }
}
