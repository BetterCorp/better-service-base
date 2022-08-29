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
