import { Tools } from "@bettercorp/tools/lib/Tools";
import {
  DeploymentProfile,
  IPluginConfig,
  IConfig,
} from "../interfaces/config";
import { IPluginLogger } from "../interfaces/logger";
import { DefaultBase } from '../interfaces/base';
import { ErrorMessages } from '../interfaces/static';

export class ConfigBase<PluginConfigType extends IPluginConfig = any>
extends DefaultBase<PluginConfigType> implements IConfig {
  readonly _deploymentProfile: string;
  constructor(pluginName: string, cwd: string, log: IPluginLogger, deploymentProfile: string) {
    super(pluginName, cwd, log);
    this._deploymentProfile = deploymentProfile;
  }
  async createAppConfig(): Promise<void> {
    throw ErrorMessages.ConfigNotImplementedProperly;
  }
  async migrateAppPluginConfig(
    pluginName: string,
    mappedPluginName: string,
    config: IPluginConfig
  ): Promise<void> {
    throw ErrorMessages.ConfigNotImplementedProperly;
  }
  public async getAppMappedPluginConfig<T extends IPluginConfig>(
    mappedPluginName: string
  ): Promise<T> {
    throw ErrorMessages.ConfigNotImplementedProperly;
  }
  public async getAppPluginDeploymentProfile(
    pluginName: string
  ): Promise<DeploymentProfile> {
    throw ErrorMessages.ConfigNotImplementedProperly;
  }
  public async getAppMappedPluginDeploymentProfile(
    mappedPluginName: string
  ): Promise<DeploymentProfile> {
    throw ErrorMessages.ConfigNotImplementedProperly;
  }
  public async getAppPluginMappedName(pluginName: string): Promise<string> {
    const mappedDeploymentProfile = await this.getAppPluginDeploymentProfile(
      pluginName
    );
    if (Tools.isNullOrUndefined(mappedDeploymentProfile)) return pluginName;
    return mappedDeploymentProfile.mappedName || pluginName;
  }
  public async getAppPluginState(pluginName: string): Promise<boolean> {
    return (await this.getAppPluginDeploymentProfile(pluginName)).enabled || false;
  }
  public async getAppMappedPluginState(mappedPluginName: string): Promise<boolean> {
    return (await this.getAppMappedPluginDeploymentProfile(mappedPluginName)).enabled || false;
  }
}
