import { SecConfig } from "../../interfaces/serviceConfig";
import { IPluginConfig } from "../../interfaces/config";

export interface PluginConfig extends IPluginConfig {
  ConfigFile: string;
}

export class Config extends SecConfig<PluginConfig> {
  public override migrate(
    mappedPluginName: string,
    existingConfig: PluginConfig
  ): PluginConfig {
    return {
      ConfigFile:
      existingConfig.ConfigFile ||
        process.env.BSB_SEC_JSON ||
        "./sec.config.yaml",
    };
  }
}
