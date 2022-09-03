import * as path from "path";
import * as fs from "fs";
import {
  ServiceConfig,
  DeploymentProfiles,
  DeploymentProfile,
  IPluginConfig,
} from "../../interfaces/config";
import { IPluginLogger } from "../../interfaces/logger";
import { ConfigBase } from "../../config/config";
import { PluginConfig } from "./sec.config";
import { IDictionary } from "@bettercorp/tools/lib/Interfaces";

export class Config extends ConfigBase<PluginConfig> {
  public readonly hehe = "I am a string";
  private _appConfig!: ServiceConfig;
  private _secConfigFilePath!: string;
  private _canWriteChanges: boolean = false;

  constructor(
    pluginName: string,
    cwd: string,
    log: IPluginLogger,
    deploymentProfile: string
  ) {
    super(pluginName, cwd, log, deploymentProfile);
  }
  private get activeDeploymentProfile(): DeploymentProfiles<DeploymentProfile> {
    return (this._appConfig.deploymentProfiles as IDictionary)[
      this._deploymentProfile
    ];
  }
  public override async getAppPluginDeploymentProfile(
    pluginName: string
  ): Promise<DeploymentProfile> {
    return this.activeDeploymentProfile[pluginName!];
  }

  public override async getAppMappedPluginConfig<T extends IPluginConfig>(
    mappedPluginName: string
  ): Promise<T> {
    return (this._appConfig.plugins[mappedPluginName] || {}) as T;
  }
  public override async getAppMappedPluginDeploymentProfile(
    mappedPluginName: string
  ): Promise<DeploymentProfile> {
    for (let dpPlugin of Object.keys(this.activeDeploymentProfile)) {
      if (
        this.activeDeploymentProfile[dpPlugin].mappedName === mappedPluginName
      )
        return this.activeDeploymentProfile[dpPlugin];
    }
    this.log.fatal("Cannot find mapped plugin {mappedPluginName}", {
      mappedPluginName,
    });
    return undefined as any; // will not reach
  }

  public override async getAppPluginMappedName(
    pluginName: string
  ): Promise<string> {
    return (
      (this.activeDeploymentProfile[pluginName] || {}).mappedName || pluginName
    );
  }
  public override async getAppPluginState(
    pluginName: string
  ): Promise<boolean> {
    return (this.activeDeploymentProfile[pluginName] || {}).enabled || false;
  }
  public override async getAppMappedPluginState(
    mappedPluginName: string
  ): Promise<boolean> {
    return (await this.getAppMappedPluginDeploymentProfile(mappedPluginName))
      .enabled;
  }

  public override async createAppConfig(): Promise<void> {
    const config = await this.getPluginConfig();

    this._secConfigFilePath =
      config.ConfigFile.indexOf(".") === 0
        ? path.join(this.cwd, config.ConfigFile)
        : config.ConfigFile;
    let defConfig: ServiceConfig = {
      deploymentProfiles: {
        default: {},
      },
      plugins: {},
    };
    if (fs.existsSync(this._secConfigFilePath)) {
      defConfig = JSON.parse(
        fs.readFileSync(this._secConfigFilePath, "utf8").toString()
      ) as ServiceConfig;
      defConfig.plugins = defConfig.plugins || {};
      defConfig.deploymentProfiles = defConfig.deploymentProfiles || {};
      defConfig.deploymentProfiles.default =
        defConfig.deploymentProfiles.default || {};
    } else {
      this.log.debug(
        "! sec.config.json CAN`T BE FOUND ... we will try create one / work in memory! {secFile}",
        { secFile: this._secConfigFilePath }
      );
    }

    this._appConfig = defConfig;
    if (!this.runningLive) {
      try {
        if (fs.existsSync(this._secConfigFilePath))
          fs.accessSync(this._secConfigFilePath, fs.constants.W_OK);
        fs.writeFileSync(
          this._secConfigFilePath,
          JSON.stringify(this._appConfig, "" as any, 2) // todo: replace this with typesafe formatting version
        );
        this._canWriteChanges = true;
      } catch (e) {
        this.log.warn(
          "We're running non-production, but {secFile} is not writable, not we're not going to create it.",
          { secFile: this._secConfigFilePath }
        );
      }
    }
  }
  public override async migrateAppPluginConfig(
    pluginName: string,
    mappedPluginName: string,
    config: IPluginConfig
  ): Promise<void> {
    this._appConfig.deploymentProfiles[this._deploymentProfile][pluginName] =
      this._appConfig.deploymentProfiles[this._deploymentProfile][
        pluginName
      ] || {
        mappedName: mappedPluginName,
        enabled: true,
      };
    this._appConfig.deploymentProfiles[this._deploymentProfile][
      pluginName
    ].enabled = true;
    this._appConfig.plugins[mappedPluginName] = config;
    if (!this._canWriteChanges) {
      if (!this.runningLive)
        return this.log.warn(
          "We're running non-production, but {secFile} is not writable, not we're not going to change it.",
          { secFile: this._secConfigFilePath }
        );
      return this.log.debug(
        "We're running production, we're not going to write to {secFile}.",
        { secFile: this._secConfigFilePath }
      );
    }
    fs.writeFileSync(
      this._secConfigFilePath,
      JSON.stringify(this._appConfig, "" as any, 2) // todo: replace this with typesafe formatting version
    );
  }
}
