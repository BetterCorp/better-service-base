import { Tools } from "@bettercorp/tools/lib/Tools";
import {
  DeploymentProfile,
  IPluginConfig,
  IConfig,
} from "../interfaces/config";
import { IPluginLogger } from "../interfaces/logger";
import { randomUUID } from "crypto";
import { hostname } from "os";

export class ConfigBase implements IConfig {
  readonly _defaultLogger: IPluginLogger;
  readonly _deploymentProfile: string;
  constructor(logger: IPluginLogger, cwd: string, deploymentProfile: string) {
    this._defaultLogger = logger;
    this._deploymentProfile = deploymentProfile;
  }
  async refreshAppConfig(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async updateAppConfig(
    pluginName?: string,
    mappedPluginName?: string,
    config?: IPluginConfig
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  public async getPluginConfig<T extends IPluginConfig>(
    pluginName: string
  ): Promise<T> {
    throw new Error("Method not implemented.");
  }
  public async getPluginDeploymentProfile(
    pluginName: string
  ): Promise<DeploymentProfile> {
    throw new Error("Method not implemented.");
  }
  public async getMappedPluginName(pluginName: string): Promise<string> {
    const mappedDeploymentProfile = await this.getPluginDeploymentProfile(
      pluginName
    );
    if (Tools.isNullOrUndefined(mappedDeploymentProfile)) return pluginName;
    return mappedDeploymentProfile.mappedName || pluginName;
  }
  public async getPluginState(pluginName: string): Promise<boolean> {
    return (await this.getPluginDeploymentProfile(pluginName)).enabled || false;
  }

  public get runningDebug(): boolean {
    throw new Error("Method not implemented.");
  }
  public get runningLive(): boolean {
    throw new Error("Method not implemented.");
  }
  public get appId(): string {
    return `${hostname()}-${randomUUID()}`;
  }
}
