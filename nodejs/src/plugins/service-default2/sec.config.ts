import { SecConfig } from "../../interfaces/serviceConfig";
import { IPluginConfig } from "../../interfaces/config";

export interface PluginConfig extends IPluginConfig {
  testa: number
  testb: number
}

export class Config extends SecConfig<PluginConfig> {
  migrate(
    mappedPluginName: string,
    existingConfig: PluginConfig
  ): PluginConfig {
    return {
      testa: existingConfig.testa || 6, // this value gets a default value
      testb: 5 // this value is unchangable
    };
  }
}
