
import { IDictionary } from "@bettercorp/tools/lib/Interfaces";

export interface IPluginConfig {} // eslint-disable-line @typescript-eslint/no-empty-interface

export interface DeploymentProfiles<T> extends IDictionary<T> {
  default: T;
}
export interface ServiceConfig {
  plugins: IDictionary<IPluginConfig>;
  deploymentProfiles: DeploymentProfiles<DeploymentProfile>;
}

export interface DeploymentProfile {
  mappedName: string;
  enabled: boolean;
}

export interface IConfig {
  get runningDebug(): boolean;
  get runningLive(): boolean;

  getPluginConfig<T extends IPluginConfig>(pluginName: string): Promise<T>;
  getPluginDeploymentProfile(pluginName: string): Promise<DeploymentProfile>;
  getMappedPluginName(pluginName: string): Promise<string>;
  getPluginState(pluginName: string): Promise<boolean>;

  refreshAppConfig(): Promise<void>;
  updateAppConfig(
    pluginName?: string,
    mappedPluginName?: string,
    config?: IPluginConfig
  ): Promise<void>;
}
