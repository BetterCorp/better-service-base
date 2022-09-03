import { SecConfig } from "../../interfaces/serviceConfig";
import { IPluginConfig } from "../../interfaces/config";

export interface PluginConfig extends IPluginConfig {
  ConfigFile: string;
}

export class Config extends SecConfig<PluginConfig> {
  public override migrate(
    mappedPluginName: string,
    existingConfig: PluginConfig | null
  ): PluginConfig {
    const mockedConfig = (existingConfig || {}) as PluginConfig;
    return {
      ConfigFile:
        mockedConfig.ConfigFile ||
        process.env.BSB_SEC_JSON ||
        "./sec.config.json",
    };
  }
}
