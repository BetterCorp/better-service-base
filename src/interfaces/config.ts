/* eslint-disable @typescript-eslint/no-unused-vars */
import { IDictionary } from "@bettercorp/tools/lib/Interfaces";
import { Tools } from "@bettercorp/tools/lib/Tools";
import { hostname } from "os";
import { randomUUID } from "crypto";
import { IPluginLogger } from "./logger";

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

export class CConfig implements IConfig {
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
  async getPluginConfig<T extends IPluginConfig>(
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

  get runningDebug(): boolean {
    throw new Error("Method not implemented.");
  }
  get runningLive(): boolean {
    throw new Error("Method not implemented.");
  }
  get appId(): string {
    return `${hostname()}-${randomUUID()}`;
  }
}
