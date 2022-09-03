import { SecConfig } from "../../interfaces/serviceConfig";
import { IPluginConfig } from "../../interfaces/config";

export interface PluginConfig extends IPluginConfig {}

export class Config extends SecConfig<PluginConfig> {
  migrate(
    mappedPluginName: string,
    existingConfig: PluginConfig | null
  ): PluginConfig {
    return {};
  }
}
