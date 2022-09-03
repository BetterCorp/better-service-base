import { IDictionary } from "@bettercorp/tools/lib/Interfaces";

export interface IPluginConfig {} // eslint-disable-line @typescript-eslint/no-empty-interface

export interface DeploymentProfiles<T> extends IDictionary<T> {
  default: T;
}
export interface ServiceConfig {
  plugins: IDictionary<IPluginConfig>;
  deploymentProfiles: DeploymentProfiles<IDictionary<DeploymentProfile>>;
}

export interface DeploymentProfile {
  mappedName: string;
  enabled: boolean;
}

export interface IConfig {
  createAppConfig(): Promise<void>;
  migrateAppPluginConfig(
    pluginName: string,
    mappedPluginName: string,
    config: IPluginConfig
  ): Promise<void>;
  getAppMappedPluginConfig<T extends IPluginConfig>(
    mappedPluginName: string
  ): Promise<T>;
  getAppPluginDeploymentProfile(pluginName: string): Promise<DeploymentProfile>;
  getAppMappedPluginDeploymentProfile(
    mappedPluginName: string
  ): Promise<DeploymentProfile>;
  getAppPluginMappedName(pluginName: string): Promise<string>;
  getAppPluginState(pluginName: string): Promise<boolean>;
  getAppMappedPluginState(mappedPluginName: string): Promise<boolean>;
}
